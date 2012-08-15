
var http = require("http");
var url = require("url");
var fs = require("fs");
var net = require('net');

//for testing
var cc = require('./ccHandler.js');

var tcpServer, httpServer;
var io;
var curSocket;


function start(route, handle) {

	function onRequest(request, response) {		
		var pathname = url.parse(request.url).pathname;
		route(handle, pathname, response, request, curSocket);
		console.log("cursocket = "+curSocket);
	}
	
	httpServer = http.createServer(onRequest);
	httpServer.listen(8081);
	console.log('HTTP server listening on ' + httpServer.address().address + ':' + httpServer.address().port);
	
	
	tcpServer = net.createServer();
	//Pass in null for host to bind server to 0.0.0.0. Then it will accept connections directed to any IPv4 address.
	tcpServer.listen(8088, null, function (){
		console.log('TCP server listening on ' + tcpServer.address().address + ':' + tcpServer.address().port);
	});
	
	
	tcpServer.on('connection', function(sock) {
		//We have a connection - a socket object is assigned to the connection automatically
		console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
						
		//Add a 'data' event handler to this instance of socket
		sock.on('data', function(data){
			
			data = String(data);
			//process.stdout.write(cc.stripTCPDelimiter(data));
			
			//jroth
			var newChars = cc.stripTCPDelimiter(data);
			cc.handleChars(newChars, curSocket);
			
			//data = String(data).substring(0, data.length - 4);
			//console.log('DATA' + sock.remoteAddress + ': ' + data);
			//process.stdout.write(data);
			
			//Write the data back to the socket, the client will receive it as data from the server
			//sock.write('You said "' + data + '"');
		});
		
		//Add a 'close' event handler to this instance of socket
		sock.on('close', function(data){
			console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
		});
	
	});
	
	
	// start socket
	io = require("socket.io").listen(httpServer);

	// on a 'connection' event
	io.sockets.on('connection', function(socket){
	
		curSocket = socket;
		console.log("Connection " + socket.id + " accepted.");
		
		socket.on('disconnect', function(){
			//curSocket = null;
			console.log("Connection " + socket.id + " terminated.");
		});	    
	});
	
}

exports.start = start;