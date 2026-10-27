"""Exercise the real HAProxy request rules with local, successful upstreams."""

import http.client
from contextlib import closing
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest


class BotRateLimits(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bundlephobia-haproxy-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.admin_socket = root / 'admin'
        networks = root / 'cloudflare.lst'
        networks.write_text('127.0.0.1/32\n')
        groups = root / 'automation-groups.map'
        groups.write_text((Path(__file__).resolve().parents[1] /
                           'operations/haproxy/automation-groups.map').read_text())
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            self.port = listener.getsockname()[1]
        source = (Path(__file__).resolve().parents[1] /
                  'operations/haproxy/haproxy.cfg').read_text()
        # Keep all production tables and frontend rules; replace host-specific
        # global settings, logging, listeners and external upstreams only.
        rules = source[source.index('backend api_client_usage'):
                       source.index('\nbackend event_ingest')]
        rules = '\n'.join(line for line in rules.splitlines()
                          if not line.strip().startswith('log-format '))
        rules = rules.replace('bind :80', f'bind 127.0.0.1:{self.port}')
        rules = rules.replace('/etc/haproxy/cloudflare-networks.lst', str(networks))
        rules = rules.replace('/etc/haproxy/automation-groups.map', str(groups))
        upstreams = {line.split()[1] for line in rules.splitlines()
                     if line.strip().startswith(('use_backend ', 'default_backend '))}
        config = root / 'haproxy.cfg'
        config.write_text(f'global\n    stats socket {self.admin_socket} level admin\n'
                          '    tune.stick-counters 5\n'
                          'userlist bundlephobia_stats_users\n'
                          '    user test insecure-password test\n'
                          'defaults\n    mode http\n    timeout connect 1s\n'
                          '    timeout client 5s\n    timeout server 1s\n' + rules +
                          '\n' + ''.join(f'backend {name}\n'
                                         '    http-request return status 503 hdr Cache-Control max-age=86400 if { path_end /upstream-unavailable }\n'
                                         '    http-request return status 429 hdr Cache-Control max-age=86400 if { path_end /upstream-busy }\n'
                                         '    http-request return status 500 hdr Cache-Control max-age=86400 if { path /upstream-error }\n'
                                         '    http-request return status 502 hdr Cache-Control max-age=86400 if { path /upstream-bad-gateway }\n'
                                         '    http-request return status 504 hdr Cache-Control max-age=86400 if { path /upstream-timeout }\n'
                                         '    http-request return status 401 hdr Cache-Control max-age=86400 if { path /upstream-unauthorized }\n'
                                         '    http-request return status 404 hdr Cache-Control max-age=60 if { path /permanent-missing }\n'
                                         '    http-request return status 200 hdr Cache-Control public,max-age=86400\n'
                                         for name in sorted(upstreams)))
        validation = subprocess.run(['haproxy', '-c', '-f', str(config)],
                                    capture_output=True, text=True)
        self.assertEqual(validation.returncode, 0, validation.stderr)
        self.proxy = subprocess.Popen(['haproxy', '-db', '-f', str(config)],
                                      stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop_proxy)
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', self.port), timeout=.1):
                    return
            except OSError:
                if self.proxy.poll() is not None:
                    self.fail('HAProxy exited before listening')
                time.sleep(.01)
        self.fail('HAProxy did not start')

    def stop_proxy(self):
        self.proxy.terminate()
        self.proxy.wait(timeout=5)

    def request(self, ua, number, path='/package/example', method=None, headers=None):
        with closing(http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)) as conn:
            conn.request(method or ('POST' if path == '/_events' else 'GET'), path, headers={
                **(headers or {}),
                'User-Agent': ua,
                'CF-Connecting-IP': (number if isinstance(number, str)
                                     else f'198.51.100.{number % 250 + 1}'),
            })
            response = conn.getresponse()
            self.response_headers = response.getheaders()
            self.retry_after = response.getheader('Retry-After')
            response.read()
            return response.status

    def assert_cache_control(self, expected):
        self.assertEqual([v for k, v in self.response_headers
                          if k.lower() == 'cache-control'], [expected])

    def runtime(self, command):
        # Advance real HAProxy state instead of sleeping fifteen minutes or
        # rewriting production thresholds. The socket belongs to this fixture.
        with socket.socket(socket.AF_UNIX) as admin:
            admin.settimeout(3)
            admin.connect(str(self.admin_socket))
            admin.sendall(f'{command}\n'.encode())
            admin.shutdown(socket.SHUT_WR)
            reply = b''
            while chunk := admin.recv(4096):
                reply += chunk
            self.assertEqual(reply.strip(), b'')

    def test_response_cache_policy_covers_private_paths_and_temporary_errors(self):
        for path in ['/stats', '/stats/dashboard/index.html',
                     '/stats/dashboard/assets/test.js', '/admin/restart']:
            self.request('Mozilla/5.0', 1, path)
            self.assert_cache_control('private, no-store')
        self.assertEqual(self.request('Mozilla/5.0', 1, '/stats/dashboard/assets/test.js',
                                     headers={'Authorization': 'Basic dGVzdDp0ZXN0'}), 200)
        self.assert_cache_control('private, no-store')
        for path, status in [('/upstream-unavailable', 503), ('/upstream-busy', 429),
                             ('/upstream-error', 500), ('/upstream-bad-gateway', 502),
                             ('/upstream-timeout', 504)]:
            self.assertEqual(self.request('Mozilla/5.0', 1, path), status)
            self.assert_cache_control('no-store')
        for path in ['/stats/dashboard/assets/upstream-unavailable', '/admin/upstream-unavailable']:
            self.assertEqual(self.request('Mozilla/5.0', 1, path,
                                         headers={'Authorization': 'Basic dGVzdDp0ZXN0'}), 503)
            self.assert_cache_control('private, no-store')
        self.assertEqual(self.request('Mozilla/5.0', 1, '/upstream-unauthorized'), 401)
        self.assert_cache_control('private, no-store')
        self.assertEqual(self.request('Mozilla/5.0', 1, '/permanent-missing'), 404)
        self.assert_cache_control('max-age=60')
        self.assertEqual(self.request('Mozilla/5.0', 1, '/_next/static/test.js'), 200)
        self.assert_cache_control('public,max-age=86400')
        self.assertNotIn('no-transform', dict(self.response_headers)['cache-control'])

    def test_families_share_across_ips_but_do_not_penalize_each_other(self):
        for i in range(190):
            self.assertEqual(self.request(['Bytespider/1', 'TikTokSpider/2'][i % 2], i,
                             ['/_events', '/asset.js'][i % 2]), 200)
        self.assertEqual(self.request('Bytespider/new-version', 240), 429)
        self.assertEqual(self.request('TikTokSpider/new-version', 241, '/_events'), 429)
        self.assert_cache_control('no-store')
        for ua in ['Badgen/1.0', 'Data-Pipeline-Enricher/1.0', 'Shields.io/test',
                   'bingbot/2', 'depscope/1', 'got/14', 'Ahrefs',
                   'Mozilla/5.0 Chrome/156.0 Safari/537.36']:
            self.assertEqual(self.request(ua, 242, '/asset.js'), 200)
        for i in range(190):
            self.assertEqual(self.request(['Googlebot/2.1', 'GoogleOther'][i % 2], i, '/asset.js'), 200)
        self.assertEqual(self.request('Google-InspectionTool', 240), 429)

    def test_cooldown_escalates_and_expires_for_bots_and_ordinary_clients(self):
        cases = [(['Bytespider/1', 'TikTokSpider/2'], True, 'bytedance'),
                 (['Googlebot/2.1', 'GoogleOther'], True, 'google'),
                 (['Lightpanda/1.0', 'LIGHTPANDA/2.0'], True, 'lightpanda'),
                 (['Mozilla/5.0 Chrome/156.0', 'Mozilla/5.0 Firefox/140.0'],
                  False, '198.51.100.201'),
                 (['Mozilla/5.0 Chrome/156.0', 'Mozilla/5.0 Firefox/140.0'],
                  False, '2001:db8::1')]
        for agents, rotating_ips, group in cases:
            with self.subTest(group=group):
                for table in ['client_group_usage', 'api_client_usage']:
                    self.runtime(f'clear table {table}')

                def send(i, path='/asset.js'):
                    return self.request(agents[i % 2], i if rotating_ips else group, path)

                for i in range(190 if rotating_ips else 120):
                    self.assertEqual(send(i), 200)
                for i in range(29):
                    self.assertEqual(send(i), 429)
                    self.assertEqual(self.retry_after, '60')
                self.assertEqual(send(240), 429)
                self.assertEqual(self.retry_after, '300')
                # Cooldown persists even when the normal rate drops below 190.
                self.runtime(f'set table client_group_usage key {group} data.http_req_rate 0')
                for i in range(89):
                    self.assertEqual(send(i, '/_events'), 429)
                    self.assertTrue(295 <= int(self.retry_after) <= 300)
                self.assertEqual(send(241, '/asset.js'), 429)
                self.assertEqual(self.retry_after, '900')
                self.assertEqual(self.request('Badgen/1.0', 242, '/asset.js'), 200)
                self.assertEqual(self.request('Mozilla/5.0 Chrome/156.0', 243), 200)
                # Model expiry and normal one-minute rate decay.
                self.runtime(f'set table client_group_usage key {group} '
                             f'data.gpt0 {int(time.time()) - 1} '
                             'data.http_req_rate 0 data.gpc0_rate 0 data.gpc1_rate 0')
                self.runtime('clear table api_client_usage')
                self.assertEqual(send(244), 200)

    def test_extreme_retries_follow_ip_across_agents_and_routes_until_expiry(self):
        for ip in ['198.51.100.201', '2001:db8::201']:
            with self.subTest(ip=ip):
                for table in ['client_group_usage', 'abusive_client_usage']:
                    self.runtime(f'clear table {table}')
                # Real upstream 429s count too; ordinary traffic is not abuse.
                for i in range(199):
                    agent = ['ExampleBot/1', 'OtherBot/2', 'Mozilla/5.0'][i % 3]
                    self.assertEqual(self.request(agent, ip, '/upstream-busy'), 429)
                    self.assertLessEqual(int(self.retry_after), 900)
                self.assertEqual(self.request('ExampleBot/1', ip, '/upstream-busy'), 429)
                self.assertEqual(self.retry_after, '21600')
                # The old family cooldown remains short for another IP.
                self.assertEqual(self.request('ExampleBot/1', '198.51.100.202', '/asset.js'), 429)
                self.assertLessEqual(int(self.retry_after), 900)
                self.assertEqual(self.request('UnrelatedBot/1', '198.51.100.203', '/asset.js'), 200)
                # Model an hour passing, including all short family bans expiring.
                deadline = int(time.time()) + 18000
                self.runtime(f'set table abusive_client_usage key {ip} data.gpt0 {deadline}')
                self.runtime('clear table client_group_usage')
                for agent, path in [('DifferentBot/2', '/api/unknown'),
                                    ('Mozilla/5.0', '/package/example'),
                                    ('curl/8', '/asset.js')]:
                    self.assertEqual(self.request(agent, ip, path), 429)
                    self.assertTrue(17995 <= int(self.retry_after) <= 18000)
                    self.assert_cache_control('no-store')
                # Continued extreme retries cannot reset or shorten the deadline.
                for _ in range(210):
                    self.assertEqual(self.request('Mozilla/5.0', ip, '/asset.js'), 429)
                self.assertTrue(17995 <= int(self.retry_after) <= 18000)
                # Banned retries must not put a fresh user-agent family in cooldown.
                for _ in range(35):
                    self.assertEqual(self.request('NewFamilyBot/1', ip, '/asset.js'), 429)
                self.assertEqual(self.request('NewFamilyBot/1', '198.51.100.204', '/asset.js'), 200)
                # A separate family ban may outlast the final seconds of an IP ban.
                self.runtime(f'set table abusive_client_usage key {ip} '
                             f'data.gpt0 {int(time.time()) + 60}')
                self.runtime(f'set table client_group_usage key crawler:newfamilybot '
                             f'data.gpt0 {int(time.time()) + 900}')
                self.assertEqual(self.request('NewFamilyBot/1', ip, '/asset.js'), 429)
                self.assertTrue(895 <= int(self.retry_after) <= 900)
                self.runtime(f'set table abusive_client_usage key {ip} '
                             f'data.gpt0 {int(time.time()) - 1} data.gpc0_rate 0')
                self.runtime('clear table client_group_usage')
                self.assertEqual(self.request('Mozilla/5.0', ip, '/asset.js'), 200)

    def test_successes_and_other_errors_do_not_trigger_extended_cooldown(self):
        ip = '198.51.100.205'
        for _ in range(210):
            self.assertEqual(self.request('ExampleBot/1', ip, '/.env'), 403)
        self.runtime('clear table client_group_usage')
        self.assertEqual(self.request('ExampleBot/1', ip, '/asset.js'), 200)
        # A small overage can still switch families: no six-hour IP ban yet.
        for _ in range(30):
            self.assertEqual(self.request('ExampleBot/1', ip, '/upstream-busy'), 429)
        self.assertEqual(self.retry_after, '300')
        self.assertEqual(self.request('DifferentBot/1', ip, '/asset.js'), 200)

    def test_api_and_page_limits_share_pools_but_keep_family_cooldowns(self):
        paths = ['/api/size', '/package/example']
        pools = [
            ('google', ['Googlebot/2.1', 'GoogleOther']),
            ('aggressive', ['Bytespider/1', 'TikTokSpider/2',
                                  'Baiduspider/1', 'PetalBot/1']),
            ('search', ['bingbot/2', 'Applebot/1', 'YandexBot/1']),
            ('ai', ['GPTBot/1', 'OAI-SearchBot/1', 'ClaudeBot/1', 'Amazonbot/1', 'Lightpanda/1']),
            ('developer_tools', ['Shields.io/1', 'Badgen/1',
                                 'Data-Pipeline-Enricher/1', 'Depscope/1']),
            ('seo', ['Ahrefs/1', 'Semrush/1', 'Dotbot/1', 'AwarioBot/1']),
        ]
        for pool, agents in pools:
            self.runtime('clear table named_bot_usage')
            for i in range(26):
                self.assertEqual(self.request(agents[i % len(agents)], i,
                                              paths[i % 2]), 200)
            for ua in agents:
                self.assertEqual(self.request(ua, 240), 429)
            # Only the first family enters cooldown; the next pool stays available.
            for i in range(30):
                self.assertEqual(self.request(agents[0], i, paths[i % 2]), 429)
            self.assertEqual(self.retry_after, '300')
            self.assertEqual(self.request(agents[0], 240, '/asset.js'), 429)
            if pool != 'google':
                self.assertEqual(self.request(agents[-1], 240, '/asset.js'), 200)
        # Every pool is below 26/min, but together they stop at the global ceiling.
        for table in ['client_group_usage', 'automated_client_usage', 'named_bot_usage']:
            self.runtime(f'clear table {table}')
        for i in range(100):
            self.assertEqual(self.request(pools[i % len(pools)][1][0], i,
                                          paths[i % 2]), 200)
        for _, agents in pools:
            self.assertEqual(self.request(agents[0], 240), 429)
        self.assertEqual(self.request('NeverSeenBot/1', 241), 429)

    def test_public_preflights_do_not_spend_budgets_or_bypass_get_cooldowns(self):
        headers = {'Origin': 'https://example.com',
                   'Access-Control-Request-Method': 'GET',
                   'Access-Control-Request-Headers': 'X-Bundlephobia-User'}
        for i in range(220):
            self.assertEqual(self.request('Googlebot/2.1', i, '/api/size',
                                          'OPTIONS', headers), 204)
        self.assertEqual([v for k, v in self.response_headers
                          if k.lower() == 'access-control-allow-origin'], ['*'])
        self.assertIn(('access-control-max-age', '600'),
                      [(k.lower(), v) for k, v in self.response_headers])
        for i in range(26):
            self.assertEqual(self.request('Googlebot/2.1', i, '/api/size'), 200)
        for i in range(30):
            self.assertEqual(self.request('Googlebot/2.1', i, '/api/size'), 429)
        self.assertEqual(self.retry_after, '300')
        self.assertEqual(self.request('Googlebot/2.1', 240, '/api/size',
                                      'OPTIONS', headers), 204)
        self.assertEqual(self.request('Googlebot/2.1', 241, '/api/size'), 429)
        self.assertEqual(self.request('FreshCrawler/1', 1, '/stats',
                                      'OPTIONS', headers), 401)
        self.assertEqual(self.request('FreshCrawler/1', 2, '/.env',
                                      'OPTIONS', headers), 403)
        self.assertNotEqual(self.request('FreshCrawler/1', 3, '/api/size',
                                         'OPTIONS'), 204)
        self.assertNotEqual(self.request('FreshCrawler/1', 4, '/api/size',
                                         'OPTIONS', {**headers,
                                         'Access-Control-Request-Method': 'POST'}), 204)
        self.assertEqual(self.request('FreshCrawler/1', 5, '/api/unknown',
                                      'OPTIONS', headers), 204)
        self.assertNotEqual(self.request('FreshCrawler/1', 6, '/apiary/size',
                                         'OPTIONS', headers), 204)
        self.assertEqual(self.request('FreshCrawler/1', 7, '/api/backup.sql',
                                      'OPTIONS', headers), 403)

    def test_unmapped_crawlers_share_limits_and_cooldowns_across_ips(self):
        families = [
            ('YisouSpider', 'yisouspider/2'),
            ('MochiImageCrawler/0.1', 'MochiImageCrawler/0.2'),
            ('Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)',
             'Mozilla/5.0 Chrome/149.0 (compatible; ExaSearchBot/2.0)'),
        ]
        for original, updated in families:
            for table in ['client_group_usage', 'automated_client_usage', 'named_bot_usage']:
                self.runtime(f'clear table {table}')
            for i in range(26):
                self.assertEqual(self.request(original, i), 200)
            self.assertEqual(self.request(updated, 240), 429)
            for i in range(30):
                self.assertEqual(self.request(updated, i), 429)
            self.assertTrue(295 <= int(self.retry_after) <= 300)
            self.runtime('clear table automated_client_usage')
            self.assertEqual(self.request(original, 241, '/asset.js'), 429)
            self.assertTrue(295 <= int(self.retry_after) <= 300)
            self.assertEqual(self.request('UnrelatedBot/1', 242), 200)
            self.assertEqual(self.request('Googlebot/2.1', 243), 200)
            self.assertEqual(self.request('Mozilla/5.0 Chrome/156.0', 244), 200)


if __name__ == '__main__':
    unittest.main()
