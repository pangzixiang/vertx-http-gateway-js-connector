# vertx-http-gateway-js-connector
[![NPM](https://img.shields.io/npm/v/vertx-http-gateway-js-connector.svg)](https://www.npmjs.com/package/vertx-http-gateway-js-connector)
## What is it
Javascript implementation for [vertx-http-gateway-connector](https://github.com/pangzixiang/vertx-http-gateway)
## How to use
```js
const Connector = require("vertx-http-gateway-js-connector")
const connector = new Connector({
    listenerHost : "localhost",
    listenerPort : 9090,
    listenerSsl : false,
    serviceName : "js-service",
    servicePort : server.address().port,
    serviceHost : "localhost",
    serviceSsl : false,
    instanceNum : 4
})
connector.connect();

setTimeout(() => connector.disconnect(), 5000)
```