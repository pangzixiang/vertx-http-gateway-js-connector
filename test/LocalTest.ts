import * as http from 'http';
import { AddressInfo } from 'node:net';
import { VertxHttpGatewayConnector } from '../src';

const server = http.createServer((req, res) => {
  if (req.url?.includes('/js-service/a')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('js service okay');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(0, 'localhost', () => {
  const port = (server.address() as AddressInfo).port;
  console.log(`Http Server started at port ${port}`);
  const connector = new VertxHttpGatewayConnector({
    registerPort: 9090,
    serviceName: 'js-service',
    servicePort: port,
    registerPath: '/register',
  });

  connector.start();

  // setTimeout(() => connector.stop(), 10000);
});
