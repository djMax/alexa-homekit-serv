import { NodeCec, CEC } from 'node-cec';

const cec = new NodeCec('node-cec');
let gets = null;
let client = null;

process.on( 'SIGINT', function() {
  if ( cec != null ) {
    cec.stop();
  }
});

export function onCreate(device) {
  cec.start( 'cec-client', '-m', '-d', '8', '-b', 'r' );
}

export async function getPower(device, callback) {
  if (!gets) {
    gets = new Promise((accept) => {
      cec.once( 'REPORT_POWER_STATUS', function (packet, status) {
        accept(status === 1 ? false : true);
      });	
    });
  }
  const waited = 0;
  while (!client) {
    await Promise.delay(1000);
    waited += 1;
    if (waited > 10) {
      break;
    }
  }
  client.sendCommand( 0x10, CEC.Opcode.GIVE_DEVICE_POWER_STATUS );
  setTimeout(() => client.sendCommand( 0x10, CEC.Opcode.GIVE_DEVICE_POWER_STATUS ), 500);

  const on = await gets;
  gets = null;
  callback(null, on);
}

export function setPower(device, value, callback) {
  client.sendCommand( 0xf0, value ? CEC.Opcode.IMAGE_VIEW_ON : CEC.Opcode.STANDBY);
  callback();
}

cec.on( 'REPORT_POWER_STATUS', function (packet, status) {
  console.log('Received CEC Power Status', packet, status);
});	

cec.once( 'ready', (clientInstance) => {
  client = clientInstance;
  console.log( ' -- CEC READY -- ' );
});

cec.on( 'ROUTING_CHANGE', function(packet, fromSource, toSource) {
  console.log( 'Routing changed from ' + fromSource + ' to ' + toSource + '.' );
});

/*
cec.on( 'data', (line) => {
  console.log('>>>>', line);
});

cec.on( 'packet', (packet) => {
  console.log('<<<<', packet);
});
*/
