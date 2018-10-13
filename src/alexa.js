function setPower(d, v, cb) {
  if (d.setPower) {
    d.setPower(v, cb);
  } else {
    d.set('power', v, cb);
  }
}

export default class AlexaHandlers {
  constructor(app, rra, func) {
    this.app = app;
    this.rra = rra;
    this.func = func;

    app.get('/devices', (...args) => this.getDevices(...args));
    app.post('/control', (...args) => this.control(...args));
  }

  getDevices(req, res) {
    const endpoints = Object
      .entries(this.rra.accessories)
      .map((arr) => {
        const [i,a] = arr;
        const ep = {
          endpointId: a.serial,
          friendlyName: a.name,
          description: a.name,
          manufacturerName: 'Lutron',
          displayCategories: [a.isSwitch ? 'SWITCH' : 'LIGHT'],
          capabilities: [{
            type: 'AlexaInterface',
            interface: 'Alexa',
            version: 3,
          }, {
            type: 'AlexaInterface',
            interface: 'Alexa.PowerController',
            version: 3,
            properties: {
              supported: [
                {
                  name: 'powerState',
                }
              ],
              retrievable: true
            },
          }],
        };
        if (!a.isSwitch) {
          ep.capabilities.push({
            type: 'AlexaInterface',
            interface: 'Alexa.BrightnessController',
            version: 3,
            properties: {
              supported: [
                {
                  name: 'brightness',
                }
              ],
              retrievable: true
            },
          })
        }
        return ep;
      });
    this.func.accessories.forEach(({ config }) => {
      endpoints.push({
        endpointId: config.serial,
        friendlyName: config.name,
        description: config.name,
        manufacturerName: config.manufacturer,
        displayCategories: config.categories || ['SWITCH'],
        capabilities: [{
          type: 'AlexaInterface',
          interface: 'Alexa',
          version: 3,
        }, {
          type: 'AlexaInterface',
          interface: 'Alexa.PowerController',
          version: 3,
          properties: {
            supported: [
              {
                name: 'powerState',
              }
            ],
          },
        }],
      });
    });

    res.json({ endpoints });
  }

  control(req, res) {
    const deviceId = req.body.payload.appliance.applianceId;
    const activity = req.body.header.name;

    let device;
    const matches = Object.entries(this.rra.accessories)
      .filter((arr) => {
        const [i,a] = arr;
        return (a.serial === deviceId);
      });
    if (matches.length) {
      device = matches[0][1];
    } else {
      const funcs = this.func.accessories.filter(d => d.config.serial === deviceId);
      if (funcs.length) {
        device = funcs[0];
      }
    }

    const confirm = (name) => ({
      header: {
        name,
        messageId: req.body.header.messageId,
        namespace: 'Alexa.ConnectedHome.Control',
        payloadVersion: 2,
      },
      payload: {}
    });
    if (activity === 'TurnOffRequest') {
      setPower(device, false, () => {
        res.json(confirm('TurnOffConfirmation'));
      });
    } else if (activity === 'TurnOnRequest') {
      setPower(device, true, () => {
        res.json(confirm('TurnOnConfirmation'));
      });
    } else if (activity === 'SetPercentageRequest') {
      device.setBrightness(req.body.payload.percentageState.value, () => {
        res.json(confirm('SetPercentageConfirmation'));
      });
    } else if (activity === 'DecrementPercentageRequest') {
      const newValue = Math.max(0, device.lastBrightness - 10);
      device.setBrightness(newValue, () => {
        res.json(confirm('DecrementPercentageConfirmation'));
      });
    } else if (activity === 'IncrementPercentageRequest') {
      const newValue = Math.min(100, device.lastBrightness + 10);
      device.setBrightness(newValue, () => {
        res.json(confirm('IncrementPercentageConfirmation'));
      });
    } else {
      res.status(500).send('fail');
    }
  }
}
