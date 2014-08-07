var ssdp = require("peer-ssdp"),
    peer = ssdp.createPeer(),
    uuid = require('node-uuid'),
    util = require('util'),
    fs = require('fs'),
    merge = require('merge'),
    express = require('express'),
    http = require('http'),
    app = express(),
    querystring = require('querystring'),
    request = require('superagent'),
    logger = require('morgan'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override')
    ;


var log = console.log;

var lib = module.exports = {};
var config = {};

var defaultApps = [
    {
        name: "ChromeCast",
        url: "https://www.gstatic.com/cv/receiver.html?$query"
    },
    {
        name: "YouTube",
        url: "https://www.youtube.com/tv?$query"
    },
    {
        name: "PlayMovies",
        url: "https://play.google.com/video/avi/eureka?$query",
        protocols: ""
    },
    {
        name: "GoogleMusic",
        url: "https://jmt17.google.com/sjdev/cast/player",
        protocols: ""
    },
    {
        name: "GoogleCastSampleApp",
        url: "http://anzymrcvr.appspot.com/receiver/anzymrcvr.html",
        protocols: ""
    },
    {
        name: "GoogleCastPlayer",
        url: "https://www.gstatic.com/eureka/html/gcp.html",
        protocols: ""
    },
    {
        name: "Fling",
        url: "$query",
        protocols: ""
    },
    {
        name: "TicTacToe",
        url: "http://www.gstatic.com/eureka/sample/tictactoe/tictactoe.html",
        protocols: ""
    }
];

var baseConfig = {
    name: "MyCast",

    log: log,
    debug: false,
    
    addr: null,
    port: 8008,

    apps: [],

    publicDir: __dirname + '/public',
    uuid: uuid.v4(),

    // eg "*"
    cors: null,
};

lib.config = function(_config) {

    if(_config) {

        config = merge(baseConfig, _config);

        config.addr = config.addr || lib.getIPAddress();
        config.apps = [];

        var _apps = {};
        for(var i in defaultApps) _apps[defaultApps[i].name] = defaultApps[i];
        for(var i in _config.apps) _apps[_config.apps[i].name] = _config.apps[i];

        for(var i in _apps) config.apps.push(_apps[i]);
    }

    if(config.log) {
        log = config.log;
    }

    return config;
};

lib.start = function(_config) {

    lib.config(_config);

    log("Server %s, uuid %s", config.name, config.uuid);

    lib.setupHttp();
    lib.setupApps();
    lib.setupRoutes();
    lib.setupSSDP();
};

lib.setupHttp = function() {

    app.set('port', config.port);
    app.use(function(req, res, next) {
        var data = '';
        req.setEncoding('utf8');
        req.on('data', function(chunk) {
            data += chunk;
        });
        req.on('end', function() {
            req.rawBody = data;
            next();
        });
    });

    if(config.cors) {
        app.use(function(req,res,next) {
            res.setHeader("Access-Control-Allow-Origin", config.cors);
            next();
        });
    }

    app.use(express.static(config.publicDir));

    if(config.debug) {
        app.use(logger());
    }

    app.use(bodyParser());
    app.use(methodOverride());
    app.use(function(req, res, next) {
        res.removeHeader("Connection");
        next();
    });

    app.disable('x-powered-by');

    var server = http.createServer(app);

    server.listen(app.get('port'), config.addr, function() {
        log('Server started on http://' + config.addr + ':' + config.port);
    });

    app.get('/config.json', function(req, res) {
        res.send({
            addr: config.addr,
            port: config.port
        });
    });

    var WebSocketServer = require('websocket').server;
    var WebSocketRouter = require('websocket').router;

    var wsServer = new WebSocketServer({
        httpServer: server,
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
        autoAcceptConnections: false
    });

    var wssRouter = new WebSocketRouter();
    wssRouter.attachServer(wsServer);

    wsServer.on('request', function(request) {
    });

    wssRouter.mount('/stage', '', function(request) {
        global.stageConnection = request.accept(request.origin);
        global.stageConnection.send(JSON.stringify({
            cmd: "idle"
        }));
    });

    wssRouter.mount('/system/control', '', function(request) {
        var connection = request.accept(request.origin);
        log("system/control");
    });

    wssRouter.mount('/connection', '', function(request) {
        var connection = request.accept(request.origin);
        var name;
        connection.on('message', function(message) {
            var cmd = JSON.parse(message.utf8Data);
            if (cmd.type == "REGISTER") {

                name = cmd.name;
                connection.send(JSON.stringify({
                    type: "CHANNELREQUEST",
                    "senderId": 1,
                    "requestId": 1
                }));

                wssRouter.mount("/receiver/" + cmd.name, '', function(request) {
                    var receiverConnection = request.accept(request.origin);
                    var appName = request.resourceURL.pathname.replace('/receiver/', '').replace('Dev', '');
                    Apps.registered[appName].registerReceiver(receiverConnection);
                });

            } else if (cmd.type == "CHANNELRESPONSE") {
                connection.send(JSON.stringify({
                    type: "NEWCHANNEL",
                    "senderId": 1,
                    "requestId": 1,
                    "URL": "ws://"+config.addr+":"+config.ip+"/receiver/" + name
                }));
            }
        });
    });

    var regex = new RegExp('^/session/.*$');
    wssRouter.mount(regex, '', function(request) {
        var sessionConn = request.accept(request.origin);
        log("Session up");

        var appName = request.resourceURL.pathname.replace('/session/', '');
        var sessionId = request.resourceURL.search.replace('?', '');

        var targetApp = Apps.registered[appName];

        if (targetApp) {
            targetApp.registerSession(sessionConn);
        }
    });

};

lib.getIPAddress = function() {
    var n = require('os').networkInterfaces();
    var ip = []
    for (var k in n) {
        var inter = n[k];
        log(inter);
        for (var j in inter) {

            if (inter[j].family === 'IPv4' && !inter[j].internal) {
                return inter[j].address;
            }
        }
    }
};

var Apps;
lib.setupApps = function() {

    Apps = require('./apps/apps.js');
    Apps.log = log;

    Apps.init(fs, app);

    config.apps.forEach(function(appInfo) {
        Apps.registerApp(app, config.addr, appInfo.name, appInfo.url, appInfo.protocols || "");
    });

    lib.Apps = Apps;
};

lib.addApp = function(appInfo) {
    if(Apps) {
        Apps.registerApp(app, config.addr, appInfo.name, appInfo.url, appInfo.protocols || "");
    }
};

lib.setupRoutes = function() {
    app.get("/ssdp/device-desc.xml", function(req, res) {
        fs.readFile(__dirname + '/device-desc.xml', 'utf8', function(err, data) {
            data = data
                    .replace("#uuid#", config.uuid)
                    .replace("#base#", "http://" + req.headers.host)
                    .replace("#name#", config.name);

            res.type('xml');
            res.setHeader("Access-Control-Allow-Method", "GET, POST, DELETE, OPTIONS");
            res.setHeader("Access-Control-Expose-Headers", "Location");
            res.setHeader("Application-URL", "http://" + req.headers.host + "/apps");
            res.send(data);
        });
    });

    app.post('/connection/:app', function(req, res) {
        log("Connecting App " + req.params.app);

        res.setHeader("Access-Control-Allow-Method", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        res.type("json");
        res.send(JSON.stringify({
            URL: "ws://" + config.addr + ":"+config.port+"/session/" + req.params.app + "?1",
            pingInterval: 3
        }));
    });

    app.get('/apps', function(req, res) {
        log("Requested /apps");
        for (var key in Apps.registered) {
            if (Apps.registered[key].config.state == "running") {
                log("Redirecting to" + key);
                res.redirect('/apps/' + key);
                return;
            }
        }

        res.setHeader("Access-Control-Allow-Method", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Expose-Headers", "Location");
        res.setHeader("Content-Length", "0");
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.send(204, "");

    });
}

lib.setupSSDP = function() {

    peer.on("ready", function() {
//        peer.on("notify", function(headers, address) {
//            log("SSDP:NOTIFY", arguments);
//        });

        peer.on("search", function(headers, address) {

            if (headers.ST.indexOf("dial-multiscreen-org:service:dial:1") !== -1) {
//                log("Replied via ssdp to DIAL request from " + address.address);
//                log("SSDP:SEARCH:DIAL", headers);
                peer.reply({
                    LOCATION: "http://" + config.addr + ":"+ config.port +"/ssdp/device-desc.xml",
                    ST: "urn:dial-multiscreen-org:service:dial:1",
                    "CONFIGID.UPNP.ORG": 7337,
                    "BOOTID.UPNP.ORG": 7337,
                    USN: "uuid:" + config.uuid
                }, address);
            }
        });
    });

    peer.start();
};

