/* Making different HTTP requests point at different parts of our code is called "routing". 
We need to be able to feed the requested URL and possible additional GET and POST 
parameters into our router, and based on these the router then needs to be able to 
decide which code to execute.*/

function route(handle, pathname, response, request, socket) {
  //console.log("About to route a request for " + pathname);
  if (typeof handle[pathname] === 'function') {
    handle[pathname](response, request, socket);
    
		console.log("cursocket0 = "+socket);
  } else {
    console.log("No request handler found for " + pathname);
    response.writeHead(404, {"Content-Type": "text/plain"});
    response.write("404 Not found");
    response.end();
  }
}

exports.route = route;