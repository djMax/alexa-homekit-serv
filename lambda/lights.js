/**
 * This sample demonstrates a simple driver  built against the Alexa Lighting Api.
 * For additional details, please refer to the Alexa Lighting API developer documentation
 * https://developer.amazon.com/public/binaries/content/assets/html/alexa-lighting-api.html
 */
var https = require('https');
var URL = require('url');
var REMOTE_CLOUD_BASE_PATH = '/alexa';

/**
 * Main entry point.
 * Incoming events from Alexa Lighting APIs are processed via this method.
 */
exports.handler = function(event, context) {

    log('Input', event);

    switch (event.header.namespace) {

        /**
         * The namespace of "Discovery" indicates a request is being made to the lambda for
         * discovering all appliances associated with the customer's appliance cloud account.
         * can use the accessToken that is made available as part of the payload to determine
         * the customer.
         */
        case 'Alexa.ConnectedHome.Discovery':
            handleDiscovery(event, context);
            break;

            /**
             * The namespace of "Control" indicates a request is being made to us to turn a
             * given device on, off or brighten. This message comes with the "appliance"
             * parameter which indicates the appliance that needs to be acted on.
             */
        case 'Alexa.ConnectedHome.Control':
            handleControl(event, context);
            break;

            /**
             * We received an unexpected message
             */
        default:
            log('Err', 'No supported namespace: ' + event.header.namespace);
            context.fail('Something went wrong');
            break;
    }
};

/**
 * This method is invoked when we receive a "Discovery" message from Alexa Smart Home Skill.
 * We are expected to respond back with a list of appliances that we have discovered for a given
 * customer.
 */
function handleDiscovery(event, context) {
    /**
     * Crafting the response header
     */
    var headers = {
        namespace: 'Alexa.ConnectedHome.Discovery',
        name: 'DiscoverAppliancesResponse',
        payloadVersion: '2',
        messageId: event.header.messageId
    };

    makeRequest('GET', 'https://' + REMOTE_CLOUD_HOSTNAME + REMOTE_CLOUD_BASE_PATH + '/devices')
        .then((body) => {
        /**
        * Craft the final response back to Alexa Smart Home Skill. This will include all the
        * discoverd appliances.
        */
        var result = {
            header: headers,
            payload: {
                discoveredAppliances: JSON.parse(body)
            }
        };

        log('Discovery', JSON.stringify(result, null, '\t'));

        context.succeed(result);
      })
      .catch((error) => {
        log('RequestFailed', error);
        context.fail('Request failed: ' + error.message);
      });
}

/**
 * Control events are processed here.
 * This is called when Alexa requests an action (IE turn off appliance).
 */
function handleControl(event, context) {
  makeRequest('POST',
    'https://' + REMOTE_CLOUD_HOSTNAME + REMOTE_CLOUD_BASE_PATH + '/control',
    JSON.stringify(event))
    .then((body) => {
        log('Control', JSON.stringify(body, null, '\t'));
        context.succeed(JSON.parse(body));
    })
    .catch((error) => {
        log('RequestFailed', error);
        context.fail('Request failed: ' + error.message);
    });
}

/**
 * Utility functions.
 */
function log(title, msg) {
    console.log('*************** ' + title + ' *************');
    console.log(msg);
    console.log('*************** ' + title + ' End*************');
}

function makeRequest(method, url, data) {
  // return new pending promise
  return new Promise((resolve, reject) => {
    // select http or https module, depending on reqested url
    var lib = url.startsWith('https') ? require('https') : require('http');
    var opts = URL.parse(url);
    opts.method = method.toUpperCase();
    if (data) {
      opts.headers = {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      };
    }
    var request = lib.request(opts, (response) => {
      // handle http errors
      if (response.statusCode < 200 || response.statusCode > 299) {
         reject(new Error('Failed to load page, status code: ' + response.statusCode));
       }
      // temporary data holder
      const body = [];
      // on every content chunk, push it to the data array
      response.on('data', (chunk) => body.push(chunk));
      // we are done, resolve promise with those joined chunks
      response.on('end', () => resolve(body.join('')));
    });
    if (data) {
      request.write(data);
    }
    request.end();
    // handle connection errors of the request
    request.on('error', (err) => reject(err))
  });
}
