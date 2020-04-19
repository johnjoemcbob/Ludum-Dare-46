var express = require('express'); // Express contains some boilerplate to for routing and such
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static('public'));

// Serve the index page 
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/index.html');
});

// Listen on port 5000
app.set('port', (process.env.PORT || 5000));
http.listen(app.get('port'), function(){
  console.log('listening on port',app.get('port'));
});

// Tell Socket.io to start accepting connections
// 1 - Keep a dictionary of all the players as key/value 
var players = {};
io.on('connection', function(socket){
    console.log("New client has connected with id:",socket.id);
  
    // Listen for new-player event on this client 
    socket.on('new-player',function(state_data){ 
      console.log("New player has state:",state_data);
      
      // 2 - Add the new player to the dict
      players[socket.id] = state_data;
      console.log("All players: ", players);
      
      // Send an update event
      io.emit('update-players',players[socket.id]);
    })
  
    // Disconnect
    socket.on('disconnect',function(){
      // 3- Delete from dict on disconnect
      console.log("disconnect: ", socket.id);
      delete players[socket.id];
      console.log("All players: ", players);
      
      // Send an update event 
      io.emit('update-players',players[socket.id]);
    })
  
    // Receive/send update
    socket.on('send-update',function(data){
      if(players[socket.id] == null) return;

      players[socket.id].id = data.id;
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].colour = data.colour;
      //console.log("received update: ", data.id);

      io.emit('update-players',data);
    })
  
    // Receive/send line
    socket.on('send-line',function(data){
      if(players[socket.id] == null) return;
      
      players[socket.id].id = data.id;
      players[socket.id].startx = data.startx;
      players[socket.id].starty = data.starty;
      players[socket.id].finishx = data.finishx;
      players[socket.id].finishy = data.finishy;
      players[socket.id].lngth = data.lngth;
      //console.log("received update: ", data.id);
      
      io.emit('update-lines',data);
    })
})
