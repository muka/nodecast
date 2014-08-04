
var dial = require('./index');

var argv = require('optimist')
    .usage('Usage: $0 --name [name] --ipaddress [ipaddress]')
    .demand(['name'])
    .argv;

var name = argv.name;
var addr = argv.ipaddress;

dial.start({
    name: name,
    addr: addr,
    uuid: 'e25f8d61-a15d-4ebb-8be7-dcf87de5b086',
});