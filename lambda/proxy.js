/**
 * This function implements an Amazon Lambda handler for incoming Alexa Smart Home calls
 * and proxies them to a self-hosted service along with a one-time password for reasonable
 * security.
 *
 * You must provide two environment variables:
 *   REMOTE_CLOUD_BASE_URL
 *   REMOTE_CLOUD_OTP_SECRET
 *
 * For more Alexa deatils, please refer to the Alexa Lighting API developer documentation
 * https://developer.amazon.com/public/binaries/content/assets/html/alexa-lighting-api.html
 */
var https = require('https');
var crypto = require('crypto');
var URL = require('url');

var REMOTE_CLOUD_BASE_URL = process.env.REMOTE_CLOUD_BASE_URL;
var REMOTE_CLOUD_OTP_SECRET = process.env.REMOTE_CLOUD_OTP_SECRET;

// Copied from https://github.com/guyht/notp
var totp = {};

/**
 * Main entry point.
 * Incoming events from Alexa Lighting APIs are processed via this method.
 */
exports.handler = function (event, context) {

  log('Input', event);

  switch (event.directive.header.namespace) {

    /**
     * The namespace of "Discovery" indicates a request is being made to the lambda for
     * discovering all appliances associated with the customer's appliance cloud account.
     * can use the accessToken that is made available as part of the payload to determine
     * the customer.
     */
    case 'Alexa.Discovery':
      handleDiscovery(event, context);
      break;

    case 'Alexa':
      if (event.directive.header.name === 'ReportState') {
        handleReport(event, context);
      }
      break;

    case 'Alexa.BrightnessController':
    case 'Alexa.PowerController':
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
  const headers = {
    namespace: 'Alexa.Discovery',
    name: 'Discover.Response',
    payloadVersion: '3',
    messageId: event.directive.header.messageId
  };

  makeRequest('GET', REMOTE_CLOUD_BASE_URL + '/devices?otp=' + totp.gen(REMOTE_CLOUD_OTP_SECRET))
    .then((body) => {
      /**
      * Craft the final response back to Alexa Smart Home Skill. This will include all the
      * discoverd appliances.
      */
      var event = {
        header: headers,
        payload: JSON.parse(body),
      };

      log('Discovery', JSON.stringify(event, null, '\t'));

      context.succeed({ event });
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
    REMOTE_CLOUD_BASE_URL + '/control?otp=' + totp.gen(REMOTE_CLOUD_OTP_SECRET),
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
 * Control events are processed here.
 * This is called when Alexa requests an action (IE turn off appliance).
 */
function handleReport(event, context) {
  makeRequest('POST',
    REMOTE_CLOUD_BASE_URL + '/report?otp=' + totp.gen(REMOTE_CLOUD_OTP_SECRET),
    JSON.stringify(event))
    .then((body) => {
      log('Report', JSON.stringify(body, null, '\t'));
      const header = {
        namespace: 'Alexa',
        name: 'StateReport',
        payloadVersion: '3',
        correlationToken: event.directive.header.correlationToken,
        messageId: event.directive.header.messageId
      };
      context.succeed({
        event: {
          header,
          endpoint: event.directive.endpoint,
        },
        context: JSON.parse(body),
      });
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
    request.on('error', (err) => reject(err));
  });
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// The bulk of the OTP generation code, replicated here for simplicity over webpack or similar //
/////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * convert an integer to a byte array
 * @param {Integer} num
 * @return {Array} bytes
 */
function intToBytes(num) {
	var bytes = [];

	for(var i=7 ; i>=0 ; --i) {
		bytes[i] = num & (255);
		num = num >> 8;
	}

	return bytes;
}

/**
 * convert a hex value to a byte array
 * @param {String} hex string of hex to convert to a byte array
 * @return {Array} bytes
 */
function hexToBytes(hex) {
	var bytes = [];
	for(var c = 0, C = hex.length; c < C; c += 2) {
		bytes.push(parseInt(hex.substr(c, 2), 16));
	}
	return bytes;
}

var hotp = {};

/**
 * Generate a counter based One Time Password
 *
 * @return {String} the one time password
 *
 * Arguments:
 *
 *  args
 *     key - Key for the one time password.  This should be unique and secret for
 *         every user as this is the seed that is used to calculate the HMAC
 *
 *     counter - Counter value.  This should be stored by the application, must
 *         be user specific, and be incremented for each request.
 *
 */
hotp.gen = function(key, opt) {
	key = key || '';
	opt = opt || {};
	var counter = opt.counter || 0;

	var p = 6;

	// Create the byte array
	var b = new Buffer(intToBytes(counter));

	var hmac = crypto.createHmac('sha1', new Buffer(key));

	// Update the HMAC with the byte array
	var digest = hmac.update(b).digest('hex');

	// Get byte array
	var h = hexToBytes(digest);

	// Truncate
	var offset = h[19] & 0xf;
	var v = (h[offset] & 0x7f) << 24 |
		(h[offset + 1] & 0xff) << 16 |
		(h[offset + 2] & 0xff) << 8  |
		(h[offset + 3] & 0xff);

	v = (v % 1000000) + '';

	return Array(7-v.length).join('0') + v;
};

/**
 * Generate a time based One Time Password
 *
 * @return {String} the one time password
 *
 * Arguments:
 *
 *  args
 *     key - Key for the one time password.  This should be unique and secret for
 *         every user as it is the seed used to calculate the HMAC
 *
 *     time - The time step of the counter.  This must be the same for
 *         every request and is used to calculat C.
 *
 *         Default - 30
 *
 */
totp.gen = function(key, opt) {
	opt = opt || {};
	var time = opt.time || 30;
	var _t = Date.now();
	// Determine the value of the counter, C
	// This is the number of time steps in seconds since T0
	opt.counter = Math.floor((_t / 1000) / time);

	return hotp.gen(key, opt);
};
