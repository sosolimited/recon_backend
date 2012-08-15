var server = require('./server');
var router = require('./router');
var requestHandlers = require('./requestHandlers');

var str='Here\'s a (good, bad, indifferent, ...) '+
        'example sentence to be used in this test '+
        'of English language "token-extraction". ' +
        'How about $10,000 in \'additional\' cash?';
        
var testString = "Perhaps even more worryingly, German data released 3:15 Thursday showed signs of a \"slowdown\" in an economy that until now had been a bright spot for the Continent's backside. A 1,000 $12,314.32 Markit index based on surveys of purchasing managers of German manufacturing companies fell to 45.0 in May from 46.2 in April."

var handle = {};

handle["/sosoCC/receiveCC/"] = requestHandlers.receiveCC;
handle["/sosoCC/receiveChars/"] = requestHandlers.receiveChars;
handle["/loadDoc"] = requestHandlers.loadDoc;


//temp: disabling server as I work out text parsing
//console.log("NOTE: server has been temporarily disabled\n");
server.start(router.route, handle);

//requestHandlers.ccHandler.parseWords(testString);