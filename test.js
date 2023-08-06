const http = require('node:http');
const Connector = require('./main')

const server = http.createServer((req, res) => {
    if (req.url.includes("/js-service/a")) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('js service okay');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
    }
});

server.listen(0, "localhost", () => {
    console.log(`Http Server started at ${server.address().port}`)
    const connector = new Connector({
        listenerHost : "localhost",
        listenerPort : 9090,
        listenerSsl : false,
        serviceName : "js-service",
        servicePort : server.address().port,
        serviceHost : "localhost",
        serviceSsl : false,
        instanceNum : 2
    })
    connector.connect();

    setTimeout(() => connector.disconnect(), 5000)
});