var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;

Common = {
	url : require("url"),
	net : require('net'),
	fs : require("fs"),
	
	mongo : new Db('test', new MongoServer("205.186.145.170", 27017, {strict:true})),	
	
	io : require("socket.io").listen(8081)
};

module.exports = Common;