/*
 * Contains integration tests for all Matrix-initiated events.
 */
"use strict";
var q = require("q");

// set up integration testing mocks
var proxyquire =  require('proxyquire');
var clientMock = require("../util/client-sdk-mock");
clientMock["@global"] = true; 
var ircMock = require("../util/irc-client-mock");
ircMock["@global"] = true;
var dbHelper = require("../util/db-helper");
var asapiMock = require("../util/asapi-controller-mock");

// set up test config
var appConfig = require("../util/config-mock");
var roomMapping = appConfig.roomMapping;

describe("Matrix-to-IRC message bridging", function() {
    var ircService = null;
    var mockAsapiController = null;

    var testUser = {
        id: "@flibble:wibble",
        nick: "M-flibble"
    };

    beforeEach(function(done) {
        console.log(" === Matrix-to-IRC Test Start === ");
        ircMock._reset();
        clientMock._reset();
        ircService = proxyquire("../../lib/irc-appservice.js", {
            "matrix-js-sdk": clientMock,
            "irc": ircMock
        });
        mockAsapiController = asapiMock.create();

        // accept connection requests
        ircMock._autoConnectNetworks(
            roomMapping.server, testUser.nick, roomMapping.server
        );
        ircMock._autoJoinChannels(
            roomMapping.server, testUser.nick, roomMapping.channel
        );
        ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        ircMock._autoJoinChannels(
            roomMapping.server, roomMapping.botNick, roomMapping.channel
        );

        // do the init
        dbHelper._reset(appConfig.databaseUri).then(function() {
            ircService.configure(appConfig.ircConfig);
            return ircService.register(mockAsapiController, appConfig.serviceConfig);
        }).done(function() {
            done();
        });
    });

    it("should bridge matrix messages as IRC text", function(done) {
        var testText = "Here is some test text.";

        ircMock._whenClient(roomMapping.server, testUser.nick, "say", 
        function(client, channel, text) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            expect(text.length).toEqual(testText.length);
            expect(text).toEqual(testText);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: testText,
                msgtype: "m.text"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge formatted matrix messages as formatted IRC text", 
    function(done) {
        var tFormattedBody = "I support <strong>strong bold</strong> and <b>"+
        'normal bold</b> and <b>bold <u>and underline</u><font color="green"> '+
        "including green</font></b>";
        var tFallback = "I support strong bold and normal bold and "+
        "bold and underline including green";
        var tIrcBody = "I support \u0002strong bold\u000f and \u0002normal bold"+
        "\u000f and \u0002bold \u001fand underline\u000f\u0002\u000303 including"+
        " green\u000f\u0002\u000f"; // last 2 codes not necessary!

        ircMock._whenClient(roomMapping.server, testUser.nick, "say", 
        function(client, channel, text) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            expect(text.length).toEqual(tIrcBody.length);
            expect(text).toEqual(tIrcBody);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tFallback,
                format: "org.matrix.custom.html",
                formatted_body: tFormattedBody,
                msgtype: "m.text"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge escaped HTML matrix messages as unescaped HTML", 
    function(done) {
        var tFormattedBody = "<p>this is a &quot;test&quot; &amp; some _ mo!re"+
        " fun ch@racters... are &lt; included &gt; here.</p>";
        var tFallback = "this is a \"test\" & some _ mo!re fun ch@racters... "+
        "are < included > here.";
        var tIrcBody = "this is a \"test\" & some _ mo!re fun ch@racters... "+
        "are < included > here.";

        ircMock._whenClient(roomMapping.server, testUser.nick, "say", 
        function(client, channel, text) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            expect(text.length).toEqual(tIrcBody.length);
            expect(text).toEqual(tIrcBody);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tFallback,
                format: "org.matrix.custom.html",
                formatted_body: tFormattedBody,
                msgtype: "m.text"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge matrix emotes as IRC actions", function(done) {
        var testEmote = "thinks";

        ircMock._whenClient(roomMapping.server, testUser.nick, "action", 
        function(client, channel, text) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            expect(text).toEqual(testEmote);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: testEmote,
                msgtype: "m.emote"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge matrix notices as IRC notices", function(done) {
        var testNotice = "Some automated message";

        ircMock._whenClient(roomMapping.server, testUser.nick, "ctcp", 
        function(client, channel, kind, text) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            expect(kind).toEqual("notice");
            expect(text).toEqual(testNotice);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: testNotice,
                msgtype: "m.notice"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge matrix images as IRC text with a URL", function(done) {
        var tBody = "the_image.jpg";
        var tMxcSegment = "somedomain.com/somecontentid";

        ircMock._whenClient(roomMapping.server, roomMapping.botNick, "say", 
        function(client, channel, text) {
            expect(client.nick).toEqual(roomMapping.botNick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            // don't be too brittle when checking this, but I expect to see the
            // image filename (body) and the http url.
            expect(text.indexOf(tBody)).not.toEqual(-1);
            expect(text.indexOf(tMxcSegment)).not.toEqual(-1);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                url: "mxc://" + tMxcSegment,
                msgtype: "m.image"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge matrix files as IRC text with a URL", function(done) {
        var tBody = "a_file.apk";
        var tMxcSegment = "somedomain.com/somecontentid";

        ircMock._whenClient(roomMapping.server, roomMapping.botNick, "say", 
        function(client, channel, text) {
            expect(client.nick).toEqual(roomMapping.botNick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(channel).toEqual(roomMapping.channel);
            // don't be too brittle when checking this, but I expect to see the
            // filename (body) and the http url.
            expect(text.indexOf(tBody)).not.toEqual(-1);
            expect(text.indexOf(tMxcSegment)).not.toEqual(-1);
            done();
        });

        mockAsapiController._trigger("type:m.room.message", {
            content: {
                body: tBody,
                url: "mxc://" + tMxcSegment,
                msgtype: "m.file"
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.message"
        });
    });

    it("should bridge matrix topics as IRC topics", function(done) {
        var testTopic = "Topics are amazingz";

        ircMock._whenClient(roomMapping.server, testUser.nick, "send", 
        function(client, command, channel, data) {
            expect(client.nick).toEqual(testUser.nick);
            expect(client.addr).toEqual(roomMapping.server);
            expect(command).toEqual("TOPIC");
            expect(channel).toEqual(roomMapping.channel);
            expect(data).toEqual(testTopic);
            done();
        });

        mockAsapiController._trigger("type:m.room.topic", {
            content: {
                topic: testTopic
            },
            user_id: testUser.id,
            room_id: roomMapping.roomId,
            type: "m.room.topic"
        });
    });
});