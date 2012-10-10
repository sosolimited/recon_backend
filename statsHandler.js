
var common = require('./common.js');

function sendStats() {

	if (common.dbUnlocked())
	{
		var curTime = new Date().getTime();
		if (curTime - common.lastCCTime < 5*1000) //stop sending stats fifteen seconds after last cc
		{
			//JRO - adding suffix
			common.mongo.collection('word_instances'+common.db_suffix, function(err, collection) {
				collection.find({speakerID:1}).count(function(err, total1) {
					collection.find({speakerID:2}).count(function(err, total2) {
			
						//console.log('STATS >> 1:'+total1+' 2:'+total2);
			
						var message = {
							type: "stats",
							calcs: [["funct", "+funct"], //function words. for testing.
											["posemo", "+posemo"], //use cat names if they correspond!
											["negemo", "+negemo"], 
											["anger", "+anger"], 
											["i", "+i"], 
											["we", "+we"], 
											["complexity", "+excl+tentat+negate-incl+discrep"],
											["status", "+we-i"],
											["depression", "+i+bio+negemo-posemo"],
											["formality", "-i+article+sixltr-present-discrep"],
											["honesty", "+i+excl-negemo"]],
							tempVal: [0,0],
							total: [total1, total2],
							timeDiff: new Date().getTime() - common.startTime
						};
					
						calcCats(message);
						
	
					});
					
				});
			});
			
			//send heartbeat as well:
			common.sendLiveState();
			
		}
		else console.log("sendStats(): no recent cc data");
	}
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
	
		// if we've already looked up this val within this function call, don't do it again
		// TODO: this should be looked up each time correct?
		
		
		if (msg[traitName]) {
		
			addVal(msg, traitModifier, traitName, [msg[traitName][0]*msg['total'][0], msg[traitName][1]*msg['total'][1]], remainder);
			
		} else {
	
			//JRO - adding db suffix
			common.mongo.collection('word_instances'+common.db_suffix, function(err, collection) {

				collection.find({categories:catName, speakerID:1}).count(function(err, val1) {
					collection.find({categories:catName, speakerID:2}).count(function(err, val2) {
	
						addVal(msg, traitModifier, traitName, [val1, val2], remainder);
					});
					
				});
				
				
			});
			
		}
	}
}

function addVal(msg, modifier, name, val, remainder) {
	//console.log("addVal "+modifier+" "+name+" "+val+" "+remainder);

	if (modifier === '-') val = [-1*val[0], -1*val[1]];

	msg['tempVal'] = [msg['tempVal'][0]+val[0], msg['tempVal'][1]+val[1]];
	
	if (remainder.length === 0) {
		msg[name] = [(msg['total'][0] == 0) ? 0 : msg['tempVal'][0]/msg['total'][0],
								 (msg['total'][1] == 0) ? 0 : msg['tempVal'][1]/msg['total'][1]];
		msg['tempVal'] = [0,0];
		msg['calcs'].shift();
	}
	else {
		//console.log(curVal+" "+val+" "+msg['total']+" "+traitName+"="+msg[traitName]);
		msg['calcs'][0][1] = remainder;
	}				
	calcCats(msg);
	
}


exports.sendStats = sendStats;