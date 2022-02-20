import express, { NextFunction, Request, Response } from 'express';
import * as data from './hopr_channels_events.json';

const app = express();
const port = 3000;

app.listen(port, () => {
  processHoprEvents();
  console.log(`Timezones by location application is running on port ${port}.`);
});

enum HoprEvent {
  Announcment = "Announcement",
  ChannelUpdated = "ChannelUpdated",
  ChannelOpened = "ChannelOpened",
  ChannelFunded = "ChannelFunded",
  ChannelClosureInitiated = "ChannelClosureInitiated",
  ChannelClosureFinalized = "ChannelClosureFinalized",
}

class HoprChannel {
  // todo change type to Account
  source: string
  // todo change type to Account
  dest: string

  balance: bigint
  commitment: bigint
  // uint256 balance;
  // bytes32 commitment;
  // uint256 ticketEpoch;
  // uint256 ticketIndex;
  // ChannelStatus status;
  // uint256 channelEpoch;
  // uint32 closureTime;
}

class HoprNode {
  // todo change type to Account
  account: string;
  publicKey: string;
}

type HoprNodes = Record<string, HoprNode>;
type HoprChannels = Record<string, HoprChannel>

class HoprNetwork {
  nodes: HoprNodes
  channels: HoprChannels
}

type HoprNetworkHistory = Record<string, HoprNetwork>

let networkHistory: HoprNetworkHistory = {}

const createNetwork = (nodesByAccount, channelsBySrcDst) => {
  let network = new HoprNetwork();
  let nodes: HoprNodes = {};
  let channels: HoprChannels = {};

  for (let key in nodesByAccount) {
    nodes[key] = nodesByAccount[key];
  }

  for (let key in channelsBySrcDst) {
    nodes[key] = channelsBySrcDst[key];
  }

  network.nodes = nodes;
  network.channels = channels;
  return network
}

const processHoprEvents = () => {
  let sortedBlocks = Object.keys(data.blocks).sort((key1, key2) => (key1.localeCompare(key2)))

  let numChannelsOpened = 0
  let numChannelsClosed = 0

  let nodesByAccount: HoprNodes = {};
  let channelsBySrcDst: HoprChannels = {};

  for (let idx in sortedBlocks) {
    var block = sortedBlocks[idx];
    let sortedTransactions = data.blocks[block]
    for (let tx in sortedTransactions) {
      let logIndices = sortedTransactions[tx];
      for (let logIdx in logIndices) {
        let message = logIndices[logIdx];
        let args = message.args;
        switch (message.event) {
          case HoprEvent.Announcment:
            let account = args.account.toLowerCase();
            if (account in nodesByAccount) {
              console.log(account + " already announced to the network");
            } else {
              let node = new HoprNode();
              node.account = account;
              node.publicKey = args.publicKey;
              nodesByAccount[account] = node;
            }
            break;
          case HoprEvent.ChannelOpened:
            var source = args.source.toLowerCase();
            var dest = args.destination.toLowerCase();
            var srcDest = source + ":" + dest;
            if (srcDest in channelsBySrcDst) {
              console.log("(" + source + "," + dest + ") already exists");
            } else {
              console.log("channel opened" + srcDest);
              numChannelsOpened++;
              let channel = new HoprChannel();
              channel.dest = dest;
              channel.source = source;
              channelsBySrcDst[srcDest] = channel;
            }
            break;
          case HoprEvent.ChannelFunded:
            var source = args.source.toLowerCase();
            var dest = args.destination.toLowerCase();
            var srcDest = source + ":" + dest;
            if (srcDest in channelsBySrcDst) {
              let channel = channelsBySrcDst[srcDest];
              // channel.balance += args.amount;
            } else {
              console.error("channel " + srcDest + " not previously seen");
            }
            break;
          case HoprEvent.ChannelUpdated:
            var source = args.source.toLowerCase();
            var dest = args.destination.toLowerCase();
            var srcDest = source + ":" + dest;
            if (srcDest in channelsBySrcDst) {
              let channel = channelsBySrcDst[srcDest];
              console.log("channel balance" + JSON.stringify(args.newState));
              // channel.balance = args.newState.balance;
              // channel.commitment = args.newState.commitment;
            } else {
              console.error("channel " + srcDest + " not previously seen");
            }
            break;
          case HoprEvent.ChannelClosureFinalized:
            var source = args.source.toLowerCase();
            var dest = args.destination.toLowerCase();
            var srcDest = source + ":" + dest;
            if (srcDest in channelsBySrcDst) {
              console.log("channel closed" + srcDest);
              numChannelsClosed++;
              delete channelsBySrcDst[srcDest];
            } else {
              console.log("(" + source + "," + dest + ") does not exist");
            }
            break;
          default:
            // console.log(message.event + " not handled");
            break;
        }
      }
    }
    networkHistory[block] = createNetwork(nodesByAccount, channelsBySrcDst)
  }

  console.log("channelsOpened/Closed: " + numChannelsOpened + "/" + numChannelsClosed);
  console.log("number of items in history: " + networkHistory.size);
}

const convertToCytoscape = (nodesByAccount, channelsBySrcDst) => {
  let nodes = [];
  let edges = [];
  for (let id in nodesByAccount) {
    nodes.push({
      'data': {
        'id': id,
        'label': id.substring(0, 10)
      }
    })
  }
  for (let id in channelsBySrcDst) {
    edges.push({
      'data': {
        'source': channelsBySrcDst[id].source,
        'target': channelsBySrcDst[id].dest
      }
    })
  }

  return { 'nodes': nodes, 'edges': edges }
}

const getHoprNetwork = (request: Request, response: Response, next: NextFunction) => {
  let network: HoprNetwork = networkHistory['20637852']
  if (request.query['blockHeight'] !== undefined) {
    let blockHeight = request.query['blockHeight'] + ""
    if (blockHeight in networkHistory) {
      network = networkHistory[blockHeight]
    } else {
      network = new HoprNetwork()
    }
  }

  if (request.query['format'] === 'cytoscape') {
    response.status(200).json(convertToCytoscape(network.nodes, network.channels));
  } else {
    response.status(200).json({ nodes: network.nodes, channels: network.channels })
  }

};
app.get('/network', getHoprNetwork);

// 20570425