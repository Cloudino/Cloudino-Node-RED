/**
 * Copyright 2013,2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    //var connectionPool = require("./lib/mqttConnectionPool");
    //var isUtf8 = require('is-utf8');

    var WebSocketClient = require("websocket").client;

    function chechConnection(node,brokerConfig)
    {
        //TODO:check reconnections
        if(!brokerConfig.client)
        {
            var client = new WebSocketClient();
            brokerConfig.client=client;
            brokerConfig.onEvents=[];

            var host="ws://"+brokerConfig.broker+":"+brokerConfig.port+"/websocket/user";

            client.on("connectFailed", function(error) {
              //console.log("Connect Error: " + error.toString());
              node.status({fill:"red",shape:"ring",text:"Disconnected"});
            });

            client.on("connect", function(connection) 
            {    
              //console.log("WebSocket Client Connected");
              client.connection=connection;
              node.status({fill:"green",shape:"dot",text:"Connected"});              

              connection.on("error", function(error) {
                  //console.log("Connection Error: " + error.toString());
                  node.status({fill:"green",shape:"dot",text:error.toString()}); 
              });
              connection.on("close", function() {
                  node.status({fill:"red",shape:"ring",text:"Disconnected"});
                  //TODO:check reconnections
                  //console.log("echo-protocol Connection Closed");
                  if(brokerConfig.client)setTimeout(function(){
                    brokerConfig.client.connect(host);
                  },10000);
              });
              connection.on("message", function(message) {
                  if (message.type === "utf8") {
                      var data=JSON.parse(message.utf8Data);
                      //console.log("Received:",data);
                      
                      if(data.type)
                      {
                        for(var x=0;x<brokerConfig.onEvents.length;x++)
                        {
                          var event=brokerConfig.onEvents[x];
                          if((data.device==event.device || !event.device) && data.type==event.type && (data.topic==event.topic || !event.topic))
                          {
                            event.event(data.device,data.topic,data.msg);
                            break;
                          }
                        }
                      }                                    
                  }
              });
              
              function initSession(email,password) {
                  connection.sendUTF(JSON.stringify({type:"login",tid:"000001",email:email,password:password}));
              }
              initSession(brokerConfig.username,brokerConfig.password);
            });  
            client.connect(host);   
        }     
    }

    function ConfigNode(n) {
        RED.nodes.createNode(this,n);
        this.broker = n.broker;
        this.port = n.port;
        if (this.credentials) {
            this.username = this.credentials.user;
            this.password = this.credentials.password;
        }
    }
    RED.nodes.registerType("cloudino-config",ConfigNode,{
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });

    function onMessageNode(n) {
        RED.nodes.createNode(this,n);
        this.topic = n.topic;
        this.broker = n.broker;
        this.device = n.device;
        this.brokerConfig = RED.nodes.getNode(this.broker);

        var node = this;
        var onEvent;
        //console.log("onMessageNode...",this);
        if (node.brokerConfig) {
            //this.status({fill:"red",shape:"ring",text:"Disconnected"});
            chechConnection(node,this.brokerConfig);            

            var event=function(device,topic,payload)
            {
                var msg = {topic:topic,payload:payload,device:device};
                node.send(msg);   
                //console.log("mensage:",msg);             
            };
            onEvent={type:"onDevMsg",event:event,topic:node.topic,device:node.device};
            node.brokerConfig.onEvents.push(onEvent);     
            //console.log("events:",node.brokerConfig.onEvents);       
        } else {
            node.error(RED._("mqtt.errors.missing-config"));
        }
        this.on('close', function() {
            if (node.brokerConfig.client) {
                //console.log("close...");
                if(node.brokerConfig.client.connection)
                {
                    node.brokerConfig.client.connection.close();
                    delete node.brokerConfig.client.connection;                    
                }
                delete node.brokerConfig.client;
            }
        });
    }
    RED.nodes.registerType("onMessage",onMessageNode);

    function postMessageNode(n) {
        RED.nodes.createNode(this,n);
        this.topic = n.topic;
        this.device = n.device;
        this.broker = n.broker;
        this.brokerConfig = RED.nodes.getNode(this.broker);

        var node = this;
        //console.log("postMessage...",this);
        if (node.brokerConfig) {
            //this.status({fill:"red",shape:"ring",text:"Disconnected"});
            //node.status({fill:"green",shape:"dot",text:"Connected"});
            chechConnection(node, node.brokerConfig);

            this.on("input",function(msg) {
                if (node.topic) {
                    msg.topic = node.topic;
                }
                //console.log("post:",msg);
                node.brokerConfig.client.connection.sendUTF(JSON.stringify({type:"post2Device",tid:msg._msgid,device:node.device,topic:msg.topic,msg:JSON.stringify(msg.payload)})); 
            });

        } else {
            node.error(RED._("mqtt.errors.missing-config"));
        }
        this.on('close', function() {
            if (node.brokerConfig.client) {
                //console.log("close...");
                if(node.brokerConfig.client.connection)
                {
                    node.brokerConfig.client.connection.close();
                    delete node.brokerConfig.client.connection;                    
                }
                delete node.brokerConfig.client;
            }
        });
    }
    RED.nodes.registerType("postMessage",postMessageNode);
}
