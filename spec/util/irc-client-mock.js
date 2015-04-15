/*
 * Mock replacement for 'irc'.
 */
"use strict";
var q = require("q");
var util = require("util");
var EventEmitter = require('events').EventEmitter;

var instanceEmitter, clientEmitter;
var DELIM = "_DELIM_";
var instances = {
    // addr +"_DELIM_" + nick : Client
};

function getClient(addr, nick) {
    return instances[addr+DELIM+nick];
};
function setClient(client, addr, nick) {
    instances[addr+DELIM+nick] = client;
    instanceEmitter.emit("client_"+addr+"_"+nick, client);
};
function setClientNick(addr, oldNick, newNick) {
    var client = instances[addr+DELIM+oldNick];
    client.nick = newNick;
    instances[addr+DELIM+newNick] = client;
    instances[addr+DELIM+oldNick] = null;
    instanceEmitter.emit("update_client_"+addr+"_"+oldNick, client);
};

module.exports._reset = function() {
    instances = {};
    instanceEmitter = new EventEmitter(); // emitter when clients are added
    clientEmitter = new EventEmitter(); // emitter when functions are called on a client.
};

function Client(addr, nick, opts) {
    // store this instance so tests can grab it and manipulate it.
    var client = this;
    this.addr = addr;
    this.nick = nick;
    this.chans = {};

    var spies = [
        "connect", "whois", "join", "send", "action", "ctcp", "say"
    ];
    spies.forEach(function(fnName) {
        client[fnName] = jasmine.createSpy("Client."+fnName);
        client[fnName].andCallFake(function() {
            // emit that the action was performed along with the args. This can
            // be caught in the form:
            // clientEmitter.on(addr+"_"+nick, function(fnName, client, arg1, arg2 ...)) {
            //     // stuff    
            // }
            var args = [client.addr+"_"+client.nick, fnName, client];
            for (var i=0; i<arguments.length; i++) {
                args.push(arguments[i]);
            }
            clientEmitter.emit.apply(clientEmitter, args);
        });
    });

    setClient(client, addr, nick);
};
util.inherits(Client, EventEmitter);
module.exports.Client = Client;

// ===== helpers

module.exports._findClientAsync = function(addr, nick) {
    var client = module.exports._findClient(addr, nick);
    if (client) {
        return q(client);
    }
    var d = q.defer();
    instanceEmitter.once("client_"+addr+"_"+nick, function(client) {
        d.resolve(client);
    });
    return d.promise;
};

module.exports._findClient = function(addr, nick) {
    return getClient(addr, nick);
};

module.exports._whenClient = function(addr, nick, fnName, invokeFn) {
    clientEmitter.on((addr+"_"+nick), function(invokedFnName, client) {
        if (invokedFnName !== fnName) {
            return;
        }
        // invoke function with the remaining args (incl. Client object)
        var args = [];
        for (var i=1; i<arguments.length; i++) {
            args.push(arguments[i]);
        }
        invokeFn.apply(this, args);
    });
};

module.exports._autoJoinChannels = function(addr, nick, channels) {
    if (typeof channels === "string") {
        channels = [channels];
    }
    module.exports._whenClient(addr, nick, "join", function(client, chan, cb) {
        if (channels.indexOf(chan) != -1) {
            if (cb) {
                cb();
            }
        }
    });
};

module.exports._autoConnectNetworks = function(addr, nick, networks) {
    if (typeof networks === "string") {
        networks = [networks];
    }
    module.exports._whenClient(addr, nick, "connect", function(client, cb) {
        if (networks.indexOf(client.addr) != -1) {
            if (cb) {
                cb();
            }
        }
    });
};