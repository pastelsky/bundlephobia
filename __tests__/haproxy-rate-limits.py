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
        upstreams = {line.split()[1] for line in rules.splitlines()
                     if line.strip().startswith(('use_backend ', 'default_backend '))}
        config = root / 'haproxy.cfg'
        config.write_text(f'global\n    stats socket {self.admin_socket} level admin\n'
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
                'CF-Connecting-IP': f'198.51.100.{number % 250 + 1}',
            })
            response = conn.getresponse()
            self.retry_after = response.getheader('Retry-After')
            response.read()
            return response.status

    def set_bot_state(self, fields):
        # Advance cooldown/rate state through HAProxy's real Runtime API rather
        # than sleeping fifteen minutes or rewriting production thresholds.
        with socket.socket(socket.AF_UNIX) as admin:
            admin.settimeout(3)
            admin.connect(str(self.admin_socket))
            admin.sendall(f'set table bot_request_usage key automated-clients {fields}\n'.encode())
            admin.shutdown(socket.SHUT_WR)
            reply = b''
            while chunk := admin.recv(4096):
                reply += chunk
            self.assertEqual(reply.strip(), b'')

    def test_shared_bot_limit_and_independent_google_budget(self):
        for i in range(190):
            self.assertEqual(self.request(['Bytespider/1', 'bingbot/2'][i % 2], i,
                             ['/package/example', '/_events', '/asset.js'][i % 3]), 200)
        self.assertEqual(self.request('Bytespider/new-version', 240), 429)
        self.assertEqual(self.request('bingbot/new-version', 241, '/_events'), 429)
        self.assertEqual(self.request('Mozilla/5.0 Chrome/156.0 Safari/537.36', 242), 200)
        for i in range(190):
            self.assertEqual(self.request(['Googlebot/2.1', 'GoogleOther'][i % 2], i), 200)
        for i in range(120):
            self.assertEqual(self.request('Google-InspectionTool', i), 429)
            self.assertEqual(self.retry_after, '60')

    def test_cooldown_escalates_across_ips_and_expires(self):
        for i in range(190):
            self.assertEqual(self.request('Bytespider/1', i), 200)
        for i in range(29):
            self.assertEqual(self.request('Bytespider/1', i), 429)
            self.assertEqual(self.retry_after, '60')
        self.assertEqual(self.request('Bytespider/new-version', 240), 429)
        self.assertEqual(self.retry_after, '300')
        # Cooldown still blocks when the normal request rate drops below 190.
        self.set_bot_state('data.http_req_rate 0')
        for i in range(89):
            self.assertEqual(self.request('bingbot/2', i, '/_events'), 429)
            self.assertTrue(295 <= int(self.retry_after) <= 300)
        self.assertEqual(self.request('Bytespider/1', 241, '/asset.js'), 429)
        self.assertEqual(self.retry_after, '900')
        self.assertEqual(self.request('Googlebot/2.1', 242), 200)
        self.assertEqual(self.request('Mozilla/5.0 Chrome/156.0 Safari/537.36', 243), 200)
        # Model time passing: the ban has expired and one-minute rates decayed.
        self.set_bot_state(f'data.gpt0 {int(time.time()) - 1} '
                           'data.http_req_rate 0 data.gpc0_rate 0')
        self.assertEqual(self.request('Bytespider/1', 244), 200)

    def test_existing_shared_automated_api_limit(self):
        for i in range(26):
            self.assertEqual(self.request('Bytespider/1', i, '/api/size'), 200)
        self.assertEqual(self.request('Bytespider/1', 240, '/api/size'), 429)
        self.assertEqual(self.request('Bytespider/1', 241), 200)


if __name__ == '__main__':
    unittest.main()
