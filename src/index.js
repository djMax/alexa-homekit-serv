import hap from 'hap-nodejs';
import LibUser from 'homebridge/lib/user';
import LibServer from 'homebridge/lib/server';
import radioRa from 'homebridge-radiora';
import functor from 'homebridge-functor';
import express from 'express';
import AlexaHandlers from './alexa';
import bodyParser from 'body-parser';

process.title = 'homebridge';

hap.init(LibUser.User.persistPath());

var server = new LibServer.Server(false);

var signals = { 'SIGINT': 2, 'SIGTERM': 15 };

Object.keys(signals).forEach(function (signal) {
  process.on(signal, function () {
    console.info(`Got ${signal}, shutting down Homebridge...`);

    // Save cached accessories to persist storage.
    server._updateCachedAccessories();
    process.exit(128 + signals[signal]);
  });
});

server.run();

const { 'homebridge-radiora': radiora, 'homebridge-sonos' : sonos }  = server._plugins;

const app = express();
app.use(bodyParser.json());

new AlexaHandlers(app, radioRa.platforms.default, functor.platforms.default);

app.listen(8082, () => {
  console.info(`Express server listening on 8082`);
});
