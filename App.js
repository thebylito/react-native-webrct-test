import React, { Component } from 'react';
import { StyleSheet, Text, View, TouchableNativeFeedback } from 'react-native';
import io from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCMediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStreamTrack,
  getUserMedia,
} from 'react-native-webrtc';
const logError = (error) => {
  //console.tron.log({ logError: error });
};
const configuration = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] };
let localStream;
let pcPeers = [];

export default class App extends Component {
  state = {
    info: 'Initializing',
    status: 'init',
    roomID: 'salaTeste',
    isFront: true,
    selfViewSrc: null,
    remoteList: [],
    textRoomConnected: false,
    textRoomData: [],
    textRoomValue: '',
    socketIds: [],
  };
  componentDidMount = () => {
    this.socket = io.connect(
      'http://localhost:4443',
      { transports: ['websocket'] },
    );
    this.socket.on('exchange', (data) => {
      this.exchange(data);
    });
    this.socket.on('leave', (socketId) => {
      this.leave(socketId);
    });

    this.socket.on('connect', (data) => {
      //console.tron.log('connect');
      this.getLocalStream(true, (stream) => {
        localStream = stream;
        this.setState({
          selfViewSrc: stream.toURL(),
          status: 'ready',
          info: 'Please enter or create room ID',
        });
      });
    });
  };
  exchange = (data) => {
    const fromId = data.from;
    let pc;
    if (fromId in pcPeers) {
      pc = pcPeers[fromId];
    } else {
      pc = createPC(fromId, false);
    }

    if (data.sdp) {
      //console.tron.log('exchange sdp', data);
      pc.setRemoteDescription(
        new RTCSessionDescription(data.sdp),
        () => {
          if (pc.remoteDescription.type == 'offer')
            pc.createAnswer((desc) => {
              //console.tron.log('createAnswer', desc);
              pc.setLocalDescription(
                desc,
                () => {
                  //console.tron.log('setLocalDescription', pc.localDescription);
                  this.socket.emit('exchange', {
                    to: fromId,
                    sdp: pc.localDescription,
                  });
                },
                logError,
              );
            }, logError);
        },
        logError,
      );
    } else {
      //console.tron.log('exchange candidate', data);
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  getStats = () => {
    const pc = pcPeers[Object.keys(pcPeers)[0]];
    if (
      pc.getRemoteStreams()[0] &&
      pc.getRemoteStreams()[0].getAudioTracks()[0]
    ) {
      const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
      //console.tron.log('track', track);
      pc.getStats(
        track,
        (report) => {
          //console.tron.log('getStats report', report);
        },
        logError,
      );
    }
  };

  leave = (socketId) => {
    //const { remoteList } = this.state;
    //console.tron.log({ leave: socketId });
    const pc = pcPeers[socketId];
    //console.tron.log(pc);
    //const viewIndex = pc.viewIndex;
    //pc.close();
    //delete pcPeers[socketId];

    this.setState((old) => ({
      remoteList: old.remoteList.filter((rem) => rem != socketId),
      info: 'One peer leave!',
    }));
  };
  createPC = (socketId, isOffer) => {
    const pc = new RTCPeerConnection(configuration);
    logError(pc);
    pcPeers[socketId] = pc;

    pc.onicecandidate = (event) => {
      //console.tron.log('onicecandidate', event.candidate);
      if (event.candidate) {
        this.socket.emit('exchange', {
          to: socketId,
          candidate: event.candidate,
        });
      }
    };

    createOffer = () => {
      pc.createOffer((desc) => {
        //console.tron.log('createOffer', desc);
        pc.setLocalDescription(
          desc,
          () => {
            //console.tron.log('setLocalDescription', pc.localDescription);
            this.socket.emit('exchange', {
              to: socketId,
              sdp: pc.localDescription,
            });
          },
          logError,
        );
      }, logError);
    };

    pc.onnegotiationneeded = () => {
      //console.tron.log('onnegotiationneeded');
      if (isOffer) {
        createOffer();
      }
    };

    pc.oniceconnectionstatechange = (event) => {
      /* console.tron.log(
        'oniceconnectionstatechange',
        event.target.iceConnectionState,
      ); */
      if (event.target.iceConnectionState === 'completed') {
        setTimeout(() => {
          this.getStats();
        }, 1000);
      }
      if (event.target.iceConnectionState === 'connected') {
        createDataChannel();
      }
    };
    pc.onsignalingstatechange = (event) => {
      //console.tron.log('onsignalingstatechange', event.target.signalingState);
    };

    pc.onaddstream = (event) => {
      //console.tron.log('onaddstream', event.stream);
      this.setState({ info: 'One peer join!' });

      const remoteList = this.state.remoteList;
      remoteList[socketId] = event.stream.toURL();
      this.setState({ remoteList: remoteList });
    };
    pc.onremovestream = (event) => {
      //console.tron.log('onremovestream', event.stream);
    };

    pc.addStream(localStream);
    console.tron.log({localStream})
    createDataChannel = () => {
      if (pc.textDataChannel) {
        return;
      }
      const dataChannel = pc.createDataChannel('text');

      dataChannel.onerror = (error) => {
        //console.tron.log('dataChannel.onerror', error);
      };

      dataChannel.onmessage = (event) => {
        //console.tron.log('dataChannel.onmessage:', event.data);
        this.receiveTextData({ user: socketId, message: event.data });
      };

      dataChannel.onopen = () => {
        //console.tron.log('dataChannel.onopen');
        this.setState({ textRoomConnected: true });
      };

      dataChannel.onclose = ()=> {
        //console.tron.log('dataChannel.onclose');
      };

      pc.textDataChannel = dataChannel;
    }
    return pc;
  };

  getLocalStream = (isFront, callback) => {
    let videoSourceId;
    const { roomID } = this.state;

    getUserMedia(
      {
        audio: true,
        video: {
          mandatory: {
            minWidth: 640, // Provide your own width, height and frame rate here
            minHeight: 360,
            minFrameRate: 30,
          },
          facingMode: isFront ? 'user' : 'environment',
          optional: videoSourceId ? [{ sourceId: videoSourceId }] : [],
        },
      },
      (stream) => {
        //console.tron.log('getUserMedia success', stream);
        callback(stream);
      },
      logError,
    );

    this.setState({ status: 'connect', info: 'Connecting' }, () => {
      this.join(roomID);
    });
  };

  join = (roomID) => {
    this.socket.emit('join', roomID, 'celular', (socketIds) => {
      //console.tron.log({ join: socketIds });
      this.setState({ socketIds });
      socketIds.forEach((socketId) => {
        this.createPC(socketId, true);
      });
    });
  };

  componentWillUnmount = () => {
    this.socket.disconnect();
  };

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>{this.state.info}</Text>
        {this.state.textRoomConnected && <Text style={styles.welcome}>conectada</Text>}
        <View style={{ flexDirection: 'row' }}>
          <Text>
            {this.state.isFront ? 'Use front camera' : 'Use back camera'}
          </Text>
          <TouchableNativeFeedback
            style={{ borderWidth: 1, borderColor: 'black' }}
            onPress={this._switchVideoType}
          >
            <Text>Switch camera</Text>
          </TouchableNativeFeedback>
        </View>
        <View>
          <Text>{this.state.info}</Text>
        </View>
        <RTCView streamURL={this.state.selfViewSrc} style={styles.selfView} />
        {/*         {mapHash(this.state.remoteList, function(remote, index) {
          return (
            <RTCView key={index} streamURL={remote} style={styles.remoteView} />
          );
        })} */}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  selfView: {
    width: 200,
    height: 150,
  },
  remoteView: {
    width: 200,
    height: 150,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  listViewContainer: {
    height: 150,
  },
});
