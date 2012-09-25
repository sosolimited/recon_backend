
var net = require("net");
var spawn = require("child_process").spawn;
var port = 3214;

var regex1 = new RegExp(/\w*\[-?\d\]/g);
var regex2 = new RegExp(/\w*/);
var regex3 = new RegExp(/-?\d/);

//finding emoticons
var regex4 = new RegExp(/\s.{2,5}\[-?\d\semoticon\]/g); //using this to avoid false positives, 
//replace with \s\S{2,}\s\[-?\d\semoticon\] once sentistrength is updated
var regex5 = new RegExp(/\S{2,}/); //finds the emoticon and the space, once regex4 is used


function normalizeEnergy(data) {

	// Contains the positive and negative energy amounts
	var returnvals = [];
	var energy = data.trim().split(" ");
	
	// Format:
	//
	// energy[0] = positive energy (int)
	// energy[1] = negative energy (int)
	// energy[2] = array of form
	// [ {word:"love", value:3},
	//	 {word:"hate", value:-4},
	// 	 …
	// ]
	
	// Ensure each index is an integer
	returnvals[0] = parseInt(energy[0], 10)-1;
	returnvals[1] = parseInt(energy[1], 10)+1;
	returnvals[2] = parseEnergyWords(data);

	return returnvals;
}

function parseEnergyWords(s) {
	
	var energy = []; //return array

	var pairs = s.match(regex1);
	
	for (p in pairs) {
		
		var word_match = pairs[p].match(regex2);
		
		var value_match = pairs[p].match(regex3);
				
		energy.push( {
			word:word_match[0], 
			value:parseInt(value_match[0],10)
		} );
	}
	
	var emoticons_pairs = s.match(regex4);
	
	for (p in emoticons_pairs)
	{	
		var emoticon = emoticons_pairs[p].match(regex5);

		var value = emoticons_pairs[p].match(regex3);
		
		energy.push( {
			emoticon:emoticon[0], 
			value:parseInt(value[0],10)
		} );

	}

	return energy;
	
}


// Spawn the sentiment strength jar application
var java = spawn("java", [ "-jar",
  __dirname + "/resources/senti-strength.jar", "explain", "sentidata", //Jro added explain
  __dirname + "/resources/data/", "listen", port ]);

module.exports = function(msg, done) {
  var socket = net.connect(port, function() {
    socket.write("GET /" + msg + "\n");
  });

  // Ensure errors can be accounted for...
  socket.on("error", function() {});

  socket.on("data", function(data) {
  
		console.log("senti data "+data);
    // Coerce data to String, because it is a Node Buffer object.
    done(normalizeEnergy(data.toString()));
  });
};


// Clean up
process.on("exit", function(code) {
  console.log('child process exited with code ' + code);
  java.kill();
  
  //spawn a new one
  java = spawn("java", [ "-jar",
  __dirname + "/resources/senti-strength.jar", "explain", "sentidata", //Jro added explain
  __dirname + "/resources/data/", "listen", port ]);
});

/*
process.on("uncaughtException", function(ex) {
  console.log('sentistrength - uncaughtException - exiting…'+ex);
  process.exit();
});
*/
process.on("disconnect", function() {
  console.log('disconnect - exiting…');
  process.exit();
});
