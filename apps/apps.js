var App = require('./app.js');

var log = function() {};

function Apps() {
    this.registered = {};
};

Apps.prototype.log = log;

Apps.prototype.init = function(fs, app) {
    log = this.log;
    var me = this;
};

Apps.prototype.registerApp = function(express, addr, name, url, protocols) {

    var app = new App(addr, name, url, protocols);
    app.log = log;
    app.registerApi(express);

    this.registered[name] = app;

    log("Registered App: "+ name);
};

var apps = new Apps();
module.exports = apps;