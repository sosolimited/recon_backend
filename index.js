//for testing
var common = require('./common.js');
var cc = require('./ccHandler.js');


var tcpServer;
var doc;
var ind, nextInd;
var intervalID;



function start() {

	// on a 'connection' event
  common.engine.on("connection", function(socket) {
	
    //curSocket = socket;
    console.log("Connection " + socket.id + " accepted.");
    
    socket.on("message", function(msg) {
      msg = JSON.parse(msg);
      console.log(msg);

      switch (msg.event) {
        case "loadDoc":
          loadDoc(msg.data["docName"], msg.data["delay"]);
      }
    });
        
    socket.on("close", function(){
      //curSocket = null;
      console.log("Connection " + socket.id + " terminated.");
    });	    

  });
	
	// create tcp server for handling cc chars stream
	tcpServer = common.net.createServer();
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
			cc.handleChars(newChars);
			
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
	
	// mongodb
	common.mongo.open(function(err, p_client) {});
	
}

// do it
start();


function loadDoc(docName, delay) {

	console.log("d "+delay+" n "+docName);
	
	try {
		doc = common.fs.readFileSync(__dirname + '/documents/' + docName, 'utf8');
		
		if (delay == 0)
			ccHandler.handleChars(doc);
		else {
			ind = 0;
			nextInd = 0;
			clearTimeout(intervalID);
			intervalID = setInterval(sendCharsFromDoc, delay);
		}
	} catch (e) {
		console.log(e);
	}		
}

function sendCharsFromDoc() {

	if (ind < doc.length) {
		nextInd = Math.min(ind + Math.floor((Math.random()*3)+1), doc.length);
		cc.handleChars(doc.substring(ind, nextInd));
		ind = nextInd;
	}
	else clearTimeout(intervalID);
	
}


function receiveChars(response, request)
{
	var url_parts = url.parse(request.url, true);
	var newChars = url_parts.query.chars;
	
	cc.handleChars(newChars);
}
