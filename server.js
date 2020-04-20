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
var socketlist = [];
io.on('connection', function(socket){
    socketlist.push(socket);
    console.log("New client has connected with id:",socket.id);
  
    // Listen for new-player event on this client 
    socket.on('new-player',function(state_data){ 
      console.log("New player has state:",state_data);
      
      // 2 - Add the new player to the dict
      players[socket.id] = state_data;
      players[socket.id].connected = [];
      console.log("All players: ", players);
      
      // Send an update event
      io.emit('update-players',players[socket.id]);
      
      checkwin();
    })
  
    // Disconnect
    socket.on('disconnect',function(){
      // 3- Delete from dict on disconnect
      console.log("disconnect: ", socket.id);
      delete players[socket.id];
      socketlist.splice(socketlist.indexOf(socket), 1);
      console.log("All players: ", players);
      
      // Send an update event 
      io.emit('update-players',players[socket.id]);
      
      checkwin();
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
      
      checkwin();
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
  
    // Receive/send juice
    socket.on('send-juice',function(data){
      if(players[socket.id] == null) return;
      
      io.emit('update-juice',data);
    })
  
    // Receive/send juice
    socket.on('send-dontdecay',function(data){
      if(players[socket.id] == null) return;
      
      io.emit('update-dontdecay',data);
      
      syncconnections( socket.id, data.ply );
      //players[socket.id].connected[data.ply] = true;
      //players[data.ply].connected[socket.id] = true;
      checkwin();
    })
})

var windelay = 50;
var currentwin = 0;
var won = false;
function checkwin()
{
  if ( won )
  {
    if ( currentwin > 100 )
    {
      io.server.close();
      
      socketlist.forEach(function(socket) {
        socket.destroy();
      });
    }
    currentwin++;
    
    return;
  }

  // Needs at least 2 players connected to win!
  var plycount = Object.keys(players).length;
  if ( plycount <= 1 ) return;

  var allconnected = false;
  var connected = 0;
  // For each player
  for (const key in players)
  {
    var player = players[key];
    // Check connected players, including through others
    var count = Object.keys(player.connected).length;
    // Count against current connected players (+1 for self)
    if ( count + 1 >= plycount )
    {
      connected++;
    }
  }
  allconnected = ( connected == plycount );

  if ( allconnected )
  {
    // While this is true, increment counter
    currentwin++;
    if ( currentwin >= windelay )
    {
      // Send win message
      io.emit('win',{});
      won = true;
    }
  }
  else
  {
    // While this is false, reset counter
    currentwin = 0;
  }
}

function syncconnections( a, b )
{
  players[a].connected[b] = true;
  players[b].connected[a] = true;
  
  for (const key in Object.keys(players[a].connected))
  {
    players[b].connected[key] = true;
  }
  for (const key in Object.keys(players[b].connected))
  {
    players[a].connected[key] = true;
  }
}