
var common = require('./common.js');

function sendStats() {

	common.mongo.collection('word_instances', function(err, collection) {
		collection.find().count(function(err, total) {

			var message = {
				type: "stats",
				calcs: [["posemo", "+posemo"], //use cat names if they correspond!
								["negemo", "+negemo"], 
								["anger", "+anger"], 
								["i", "+i"], 
								["we", "+we"], 
								["complexity", "+excl+tentat+negate-incl+discrep"],
								["status", "+we-i"],
								["depression", "+i+physical+negemo-posemo"],
								["formality", "-i+article+sixltr-present-discrep"],
								["honesty", "+self+you+heshe+they+ipron+excl-negemo"]],
				tempVal: 0,
				total: total,
				timeDiff: new Date().getTime() - common.startTime
			};
			
			calcCats(message);

		});
	});
		

}

function calcCats(msg) {

	if (msg['calcs'].length === 0) {
		common.sendMessage(msg, true);
	}
	
	else {
	
		var traitModifier = msg['calcs'][0][1].substring(0,1);
		var traitName = msg['calcs'][0][0];
		
		var catEndIndex = msg['calcs'][0][1].substring(1).search(/[+,-]+/)+1;
		if (catEndIndex === 0) catEndIndex = msg['calcs'][0][1].length;
		
		var catName = msg['calcs'][0][1].substring(1,catEndIndex);
		var remainder = msg['calcs'][0][1].substring(catEndIndex);
		
		//console.log(traitModifier+" "+traitName+" "+catEndIndex+" "+catName+" "+remainder);
	
		// if we've already looked up this val, don't do it again
		if (msg[traitName]) {
		
			addVal(msg, traitModifier, traitName, msg[traitName]*msg['total'], remainder);
			
		} else {
	
			common.mongo.collection('word_instances', function(err, collection) {
			
				collection.find({categories:catName}).count(function(err, val) {
	
					addVal(msg, traitModifier, traitName, val, remainder);
					
				});
				
				
			});
		}
	}
}

function addVal(msg, modifier, name, val, remainder) {
	msg['tempVal'] = (modifier === '+') ? msg['tempVal']+val : msg['tempVal']-val;
	
	if (remainder.length === 0) {
		msg[name] = msg['tempVal']/msg['total'];
		msg['tempVal'] = 0;
		msg['calcs'].shift();
	}
	else {
		//console.log(curVal+" "+val+" "+msg['total']+" "+traitName+"="+msg[traitName]);
		msg['calcs'][0][1] = remainder;
	}				
	calcCats(msg);
	
}


function genRand100() {
	return Math.floor(Math.random()*100);
}


exports.sendStats = sendStats;