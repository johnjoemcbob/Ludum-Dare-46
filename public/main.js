// Assets
var ASSET_CIRCLE_CUTOUT = "https://cdn.glitch.com/91cbd087-948f-4774-b428-573af5412e28%2Fcircle_cutout.png?v=1587302526665";
var ASSET_CIRCLE_ARROW  = "https://cdn.glitch.com/91cbd087-948f-4774-b428-573af5412e28%2Fcircle_arrow.png?v=1587325986138";

var WINDOW_WIDTH = 512;
var WINDOW_HEIGHT = 512 + 128;
var GAME_SIZE = WINDOW_WIDTH;

var COLOUR_BACKGROUND = 0x70c270;
var COLOUR_GAMECIRCLE = 0x000000;
var COLOUR_UI         = 0xffffff;
var COLOUR_DECAY      = 0x555555;
var COLOUR_WATER      = 0x00aadd;
var COLOURS = [
  0xf8a5c2,
  0xf7d794,
  0xf3a683,
  0x778beb,
  0xe77f67,
  0xcf6a87,
  0x786fa6,
  0x63cdda,
  0xea8685,
  0x7bed9f,
];

var PLANT_DIAM = 8;
var ROOT_GROW = 6;
var ROOT_GROWCOST = 1;
var ROOT_GROWTHIN = 0.3;
var ROOT_MAXRANGE = PLANT_DIAM * ROOT_GROW / 3;
var ROOT_COLLIDE_ALLOWANCE = 5;
var ROOT_COLLIDE_ALLOWANCE_NEW = 5;
var ROOT_STARTLIFE = 50;
var ROOT_DECAYLIFE = 20;
var ROOT_DECAYBUFFER = 1;

var WATER_SIZE = 64;

var JUICE_START = 100;
var JUICE_ADD = 0.01;
var JUICE_SHARE = 0.005;

var UI_ARROW_SCALE = 1.5;

var WON = false;

var other_players = {};

var global;
var socket;
var graphics;
var graphics_ui;
var rt;
var rt_ui;
var border;

var config = {
    type: Phaser.AUTO,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    backgroundColor: '#00ff00',
    scene: {
      preload: preload,
      create: create,
      update: update,
    }
};
var game = new Phaser.Game(config);

var water = {
    circle: new Phaser.Geom.Circle( GAME_SIZE / 2, GAME_SIZE / 2, WATER_SIZE ),
}

var player = {
    lines: {},
    circle: new Phaser.Geom.Circle( 0, 0, PLANT_DIAM ),
    arrow: null,
    colour: 0xffffff,
    points: [],
    collisions: [],
    lastpos: new Phaser.Math.Vector2( -1, -1 ),
    direction: new Phaser.Math.Vector2( 0, 0 ),
    heldnumdrawn: 0,
    juice: JUICE_START,
    update: function(time, delta)
    {
      // Update position with other players
      socket.emit("send-update", {
          id: socket.id,
          x: this.circle.x,
          y: this.circle.y,
          colour: this.colour,
      })

      this.resources(time, delta);
      this.decay(time, delta);

      this.input(time, delta);
    },
    resources: function(time, delta)
    {
      // Resources
      for (var index = 0; index < this.collisions.length; ++index)
      {
        // If type is water
        var col = this.collisions[index];
        if ( col.type == "Water" )
        {
          this.dontdecay( col );

          // Add juice to player (clamped)
          this.juice = Math.min( this.juice + JUICE_ADD, JUICE_START );
        }
        else
        {
          this.dontdecay( col );

          // Then type is player id
          // Add juice to player (clamped)
          if ( false )
          {
            this.juice = Math.max( 0, this.juice - JUICE_SHARE );

            socket.emit("send-juice", {
              id: socket.id,
              player: col.type,
              juice: JUICE_SHARE,
            })
          }
        }
      }
    },
    dontdecay: function( col )
    {
      // Track all the way down that root and keep them alive
      var ind = col.index;
      var root = this.points[ind].lngth;
      while ( root > 0 )
      {
        this.points[ind].life = Math.min( this.points[ind].life + 1, ROOT_DECAYLIFE );

        if ( this.points[ind].last === undefined )
        {
          break;
        }
        ind = this.points[ind].last;
        root = this.points[ind].lngth;
      }
    },
    decay: function(time, delta)
    {
      // Find and track ends of every branch
      // Hold all indices until another line references it
      var ends = [];
      for (var index = 1; index < this.points.length; ++index)
      {
        if ( this.points[index] != null )
        {
          ends.push(index);
          if ( ends.includes( this.points[index].last ) )
          {
            removeElement( ends, this.points[index].last );
          }
        }
      }
      // Grey each end, removing if it is <=0
      for (var index = 0; index < ends.length; ++index)
      {
        var line = this.points[ends[index]];
        if ( line != undefined )
        {
          var lastpos = this.points[line.last];
          if ( lastpos != undefined )
          {
            line.life--;
            if ( line.life <= ROOT_DECAYLIFE )
            {
              var pos = {x: line.x + line.dir.x * ROOT_DECAYBUFFER, y: line.y + line.dir.y * ROOT_DECAYBUFFER};
              var colour = Phaser.Display.Color.Interpolate.ColorWithColor( Phaser.Display.Color.ValueToColor( COLOUR_DECAY ), Phaser.Display.Color.ValueToColor( player.colour ), ROOT_DECAYLIFE + 2, line.life );
              colour = Phaser.Display.Color.GetColor( colour.r, colour.g, colour.b );
              DrawLine( graphics, lastpos.x, lastpos.y, pos.x, pos.y, ROOT_MAXRANGE - ( line.lngth * ROOT_GROWTHIN ) + 2, colour );
              if ( line.life <= 0 )
              {
                //DrawLine( lastpos.x, lastpos.y, line.x, line.y, ROOT_MAXRANGE - line.lngth, 0xaaaaaa );
                this.points[ends[index]] = null;
                this.onDecay();
              }
              
              socket.emit("send-line", {
                id: socket.id,
                startx: lastpos.x,
                starty: lastpos.y,
                finishx: pos.x,
                finishy: pos.y,
                lngth: line.lngth,
                colour: colour,
              })
            }
          }
        }
      }

      DrawCircle( this.circle, this.colour );
    },
    input: function(time, delta)
    {
      var pointer = game.input.mousePointer;

      // Input
      if (game.input.mousePointer.isDown)
      {
        // Get lastpos to attach to
        var pos = new Phaser.Math.Vector2( pointer.worldX, pointer.worldY );
        if ( this.lastpos.x == -1 )
        {
          this.lastpos = GetClosest(this.points, pos);
        }

        var dist = ROOT_GROW;

        // Get direction if just clicked
        var dir;
        if ( this.direction.x == 0 && this.direction.y == 0 )
        {
          var dir = pos.subtract(this.lastpos).normalize();
          dir = new Phaser.Math.Vector2( dir.x * dist, dir.y * dist );
          this.direction = dir;
        }
        dir = this.direction;

        // Sine for organic
        var right = getright( dir );
        var sin = Math.sin(this.heldnumdrawn/10)/2;
          if ( dist < ROOT_GROW )
          {
            sin = 0;
          }

        // All together now
        pos = new Phaser.Math.Vector2( this.lastpos.x + dir.x + right.x * sin, this.lastpos.y + dir.y + right.y * sin );

        // If no collision, grow!
        if ( this.juice > 0 && ( this.heldnumdrawn < ROOT_COLLIDE_ALLOWANCE_NEW || !CheckCollisions( this.lastpos, pos ) ) )
        {
          var line = {
            x: pos.x,
            y: pos.y,
            dir: new Phaser.Math.Vector2( dir.x, dir.y ),
            last: this.points.indexOf( this.lastpos ),
            lngth: this.lastpos.lngth + 1,
            life: ROOT_STARTLIFE
          };
          if ( line.lngth * ROOT_GROWTHIN <= ROOT_MAXRANGE )
          {
            // Visually expand a little to fill gaps
            pos = new Phaser.Math.Vector2( pos.x + dir.x, pos.y + dir.y);

            DrawLine( graphics, this.lastpos.x, this.lastpos.y, pos.x, pos.y, ROOT_MAXRANGE - line.lngth * ROOT_GROWTHIN, this.colour );
            this.points.push( line );

            // Communicate
            socket.emit("send-line", {
              id: socket.id,
              startx: this.lastpos.x,
              starty: this.lastpos.y,
              finishx: pos.x,
              finishy: pos.y,
              lngth: line.lngth,
              index: this.points.length - 1,
              colour: this.colour,
            })

            this.lastpos = this.points[this.points.length - 1];
            this.heldnumdrawn++;
            this.juice -= ROOT_GROWCOST;
          }
        }

        // Hide ui arrow if holding
        this.arrow.x = -WINDOW_WIDTH;
      }
      else
      {
        this.lastpos = { x: -1 };
        this.direction.x = 0;
        this.direction.y = 0;
        this.heldnumdrawn = 0;

        // Show gui helper next to closest
        var pos = new Phaser.Math.Vector2( pointer.worldX, pointer.worldY );
        var close = GetClosest(this.points, pos);
        var dir = (pos.subtract(new Phaser.Math.Vector2( close.x, close.y ))).normalize();
        this.arrow.x = close.x;
        this.arrow.y = close.y;
        this.arrow.scale = Math.max( 0.1, ( ROOT_MAXRANGE - close.lngth ) / 64 * UI_ARROW_SCALE + 0.2 );
        this.arrow.scaleX = this.arrow.scale * 0.8;
        this.arrow.angle = dir.angle() / 6.2 * 360 + 90;
      }
    },
    onDecay: function()
    {
      this.juice += ROOT_GROWCOST;
    },
};

function preload()
{
    global = this;
    this.cameras.main.setBackgroundColor(COLOUR_BACKGROUND);
    this.load.image('circle_cutout', ASSET_CIRCLE_CUTOUT);
    this.load.image('circle_arrow', ASSET_CIRCLE_ARROW);
}

function create()
{
    // Init network
    socket = io(); // This triggers the 'connection' event on the server
    net_receive();

    // Init render
    rt = this.add.renderTexture(0, 0, GAME_SIZE, GAME_SIZE).setInteractive().setDepth(0);
    rt_ui = this.add.renderTexture(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT).setInteractive().setDepth(1001);
    graphics = this.add.graphics(0,0);//.fillStyle(0x000000).lineStyle(1, 0xffffff).fillRect(0, 0, 128, 128).strokeRect(0, 0, 128, 128).setDepth(1000);
      DrawClear();
      DrawCircle( water.circle, COLOUR_WATER );
      border = this.add.image(GAME_SIZE / 2, GAME_SIZE / 2, 'circle_cutout');
      border.tint = COLOUR_BACKGROUND;
    graphics_ui = this.add.graphics(0,0);//.fillStyle(0x000000).lineStyle(1, 0xffffff).fillRect(0, 0, 128, 128).strokeRect(0, 0, 128, 128).setDepth(1000);
    this.cameras.main.setBounds(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    // Player init
    player.circle.x = ( Math.random() * GAME_SIZE );
    player.circle.y = ( Math.random() * GAME_SIZE );
    player.arrow = this.add.image( PLANT_DIAM * 2, PLANT_DIAM * 2, 'circle_arrow');
    player.colour = COLOURS[Math.floor( Math.random() * COLOURS.length )];
    player.points.push( { x: player.circle.x, y: player.circle.y, lngth: 0 } );
    DrawCircle( player.circle, player.colour );

    // Connect
    socket.emit('new-player', {
        x: player.x,
        y: player.y,
        colour: player.colour,
    })
}

function net_receive()
{
    // Listen for other players connecting
    socket.on('update-players', function(data)
    {
        // Only update other players..
        if ( data != null && data.id != socket.id )
        {
          // Track other players connected
          if (other_players[data.id] == undefined)
          {
            other_players[data.id] = NewPlayer( data );
            if ( other_players[data.id].circle.x != 0 )
            {
              DrawCircle( other_players[data.id].circle, data.colour );
            }
          }

          other_players[data.id].circle.x = data.x;
          other_players[data.id].circle.y = data.y;
          //if ( data.colour != null )
          {
            other_players[data.id].colour = data.colour;
          }
        }
    })

    socket.on('update-lines', function(data)
    {
        // Only update other players..
        if ( data.id != socket.id )
        {
          other_players[data.id].lines.push( data );
          DrawLine( graphics, data.startx, data.starty, data.finishx, data.finishy, ROOT_MAXRANGE - data.lngth * ROOT_GROWTHIN, data.colour);
        }
    })

    socket.on('update-juice', function(data)
    {
        // Only update other players..
        if ( data.id != socket.id && socket.id == data.player )
        {
          player.juice = Math.min( player.juice + data.juice, JUICE_START );
        }
    })

    socket.on('update-dontdecay', function(data)
    {
        // Only update other players..
        if ( socket.id == data.ply )
        {
          player.collisions.push({type: data.ply, index: data.index});
        }
    })
  
    socket.on('win', function(data)
    {
      if ( !WON )
      {
        WON = true;

        var text1 = global.add.text(WINDOW_WIDTH / 2 - 66, 8, 'GREW TOGETHER!');
      }
    })
}

var delay = 0;
function update(time, delta)
{
  if ( !WON )
  {
    player.update(time, delta);
  };

  render(time, delta);
}

function render(time, delta)
{
  rt.draw(graphics);
  rt.draw(border, GAME_SIZE / 2, GAME_SIZE / 2);
  if ( delay <= time )
  {
    graphics.clear();
    delay = time + 0.1;
  }

  render_ui(time, delta);
}

function render_ui(time, delta)
{  
  // Clear
  rt_ui.clear();
  graphics_ui.clear();

  // Self cursor
  //rt_ui.draw(player.arrow);

  // Names
  // TODO

  // Resource bar
  var UI_JUICE_BAR_WIDTH = WINDOW_WIDTH / 2;
  var UI_JUICE_BAR_HEIGHT = 32;
  var UI_JUICE_BAR_INNER = 4;
  var x = WINDOW_WIDTH / 2 - UI_JUICE_BAR_WIDTH / 2;
  var y = WINDOW_WIDTH + UI_JUICE_BAR_HEIGHT;
  DrawLine( graphics_ui, x, y, x + UI_JUICE_BAR_WIDTH, y, UI_JUICE_BAR_HEIGHT, COLOUR_UI);
  if ( player.juice > 0 )
  {
    DrawLine( graphics_ui, x + UI_JUICE_BAR_INNER, y, x + ( UI_JUICE_BAR_WIDTH - UI_JUICE_BAR_INNER * 2 ) * (player.juice+1) / JUICE_START, y, UI_JUICE_BAR_HEIGHT - UI_JUICE_BAR_INNER * 2, player.colour);
  }

  // Now draw all ui graphics
  rt_ui.draw(graphics_ui);
}

function GetClosest(array, to)
{
  var closest = array[0];
  var mindist = -1;
  for (var index = 0; index < array.length; ++index)
  {
      var point = array[index];
      if ( point != null )
      {
        var dist = to.distance( new Phaser.Math.Vector2( point.x, point.y ) );
        if (mindist == -1 || dist < mindist)
        {
          closest = point;
          mindist = dist;
        }
      }
  }
  return closest;
}

function CheckCollisions( a, b )
{
  // Own roots
  var lastpos = new Phaser.Math.Vector2( player.circle.x, player.circle.y );
  for (var index = 0; index < player.points.length - ROOT_COLLIDE_ALLOWANCE; ++index)
  {
    if ( player.points[index] != null )
    {
      if ( CheckCollision( a, b, lastpos, player.points[index] ) )
      {
        return true;
      }
      
      lastpos = player.points[index];
    }
  }

  // Other player roots
  for (const key in other_players)
  {
    if ( key != undefined )
    {
      var ply = other_players[key];
      if ( ply.lines != undefined && ply.lines.length > 0 )
      {
        for (var index = 0; index < ply.lines.length; ++index)
        {
          var line = ply.lines[index];
          var start = {x: line.startx, y: line.starty};
          var finish = {x: line.finishx, y: line.finishy};
          if ( CheckCollision( a, b, start, finish ) )
          {
            var added = AddCollision({type: ply, index: player.points.length - 1});
            
            if ( added )
            {
              // Tell the other player not to decay this root
              console.log( line );
              socket.emit("send-dontdecay", {
                id: socket.id,
                ply: key,
                index: line.index,
              })
            }
            
            return true;
          }
        }
      }
    }
  }

  // Water
  if ( CheckCircleCollision( a, b, water.circle, WATER_SIZE ) )
  {
    AddCollision( {type: "Water", index: player.points.length - 1} );
    return true;
  }

  return false;
}

function CheckCollision( a, b, c, d )
{
    var denominator = ((b.x - a.x) * (d.y - c.y)) - ((b.y - a.y) * (d.x - c.x));
    var numerator1 = ((a.y - c.y) * (d.x - c.x)) - ((a.x - c.x) * (d.y - c.y));
    var numerator2 = ((a.y - c.y) * (b.x - a.x)) - ((a.x - c.x) * (b.y - a.y));

    // Detect coincident lines
    if (denominator == 0) return numerator1 == 0 && numerator2 == 0;

    var r = numerator1 / denominator;
    var s = numerator2 / denominator;

    return (r >= 0 && r <= 1) && (s >= 0 && s <= 1);
}

// https://codereview.stackexchange.com/questions/192477/circle-line-segment-collision
function CheckCircleCollision(A, B, C, radius)
{
    var dist;
    const v1x = B.x - A.x;
    const v1y = B.y - A.y;
    const v2x = C.x - A.x;
    const v2y = C.y - A.y;
    // get the unit distance along the line of the closest point to
    // circle center
    const u = (v2x * v1x + v2y * v1y) / (v1y * v1y + v1x * v1x);

    // if the point is on the line segment get the distance squared
    // from that point to the circle center
    if(u >= 0 && u <= 1){
        dist  = (A.x + v1x * u - C.x) ** 2 + (A.y + v1y * u - C.y) ** 2;
    } else {
        // if closest point not on the line segment
        // use the unit distance to determine which end is closest
        // and get dist square to circle
        dist = u < 0 ?
              (A.x - C.x) ** 2 + (A.y - C.y) ** 2 :
              (B.x - C.x) ** 2 + (B.y - C.y) ** 2;
    }
    return dist < radius * radius;
}

function AddCollision( col )
{
  var found = false;
    for (var index = 0; index < player.collisions.length; ++index)
    {
      var other = player.collisions[index];
      if ( col.type == other.type && col.index == other.index )
      {
        found = true;
      }
    }
  if ( !found )
  {
    player.collisions.push( col );
    return true;
  }
  return false;
}

function NewPlayer(data)
{
  var ply = {
    circle: new Phaser.Geom.Circle( data.x, data.y, PLANT_DIAM ),
    lines: [],
  };
  return ply;
}

function DrawClear()
{
  // Background colour
  //graphics.fillStyle(COLOUR_BACKGROUND, 1);
  //graphics.fillCircle(WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2, WINDOW_WIDTH);

  // Black circle in center
  graphics.fillStyle(COLOUR_GAMECIRCLE, 1);
  graphics.fillCircle(GAME_SIZE / 2, GAME_SIZE / 2, GAME_SIZE / 2);
}

var line = new Phaser.Geom.Line(0, 0, 0, 0);
function DrawLine( gfx, startx, starty, finishx, finishy, width, colour )
{
  gfx.lineStyle(width, colour);
  line.x1 = startx;
  line.y1 = starty;
  line.x2 = finishx;
  line.y2 = finishy;

  gfx.strokeLineShape(line);
}

function DrawCircle( circle, colour )
{
  graphics.fillStyle(colour, 1);
  graphics.fillCircleShape(circle);
}

function getright( vector )
{
  return new Phaser.Math.Vector2( -vector.y, vector.x );
}

function removeElement(array, elem)
{
    var index = array.indexOf(elem);
    if (index > -1)
    {
        array.splice(index, 1);
    }
}
