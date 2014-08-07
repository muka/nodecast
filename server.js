
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
});