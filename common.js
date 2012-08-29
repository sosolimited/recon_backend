var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;

Common = {
	url : require("url"),
	net : require('net'),
	fs : require("fs"),
	
	mongo : new Db('test', new MongoServer("localhost", 27017, {strict:true})),	
	
	io : require("socket.io").listen(8081)
};

module.exports = Common;