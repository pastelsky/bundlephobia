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
                          '    tune.stick-counters 4\n'
                          'userlist bundlephobia_stats_users\n'
                          '    user test insecure-password test\n'
                          'defaults\n    mode http\n    timeout connect 1s\n'
                          '    timeout client 5s\n    timeout server 1s\n' + rules +
                          '\n' + ''.join(f'backend {name}\n'
                                         '    http-request return status 200\n'
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

    def request(self, ua, number, path='/package/example'):
        with closing(http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)) as conn:
            conn.request('POST' if path == '/_events' else 'GET', path, headers={
                'User-Agent': ua,
                'CF-Connecting-IP': (number if isinstance(number, str)
                                     else f'198.51.100.{number % 250 + 1}'),
            })
            response = conn.getresponse()
            self.retry_after = response.getheader('Retry-After')
            response.read()
            return response.status

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

    def test_families_share_across_ips_but_do_not_penalize_each_other(self):
        for i in range(190):
            self.assertEqual(self.request(['Bytespider/1', 'TikTokSpider/2'][i % 2], i,
                             ['/_events', '/asset.js'][i % 2]), 200)
        self.assertEqual(self.request('Bytespider/new-version', 240), 429)
        self.assertEqual(self.request('TikTokSpider/new-version', 241, '/_events'), 429)
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

    def test_api_and_page_limits_share_pools_but_keep_family_cooldowns(self):
        paths = ['/api/size', '/package/example']
        pools = [
            ('google', ['Googlebot/2.1', 'GoogleOther']),
            ('aggressive', ['Bytespider/1', 'TikTokSpider/2',
                                  'Baiduspider/1', 'PetalBot/1']),
            ('search', ['bingbot/2', 'Applebot/1', 'YandexBot/1']),
            ('ai', ['GPTBot/1', 'OAI-SearchBot/1', 'ClaudeBot/1', 'Amazonbot/1']),
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
