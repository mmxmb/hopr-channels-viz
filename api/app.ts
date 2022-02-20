import { BigNumber } from 'bignumber.js';
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

  balance: BigNumber
  weight: BigNumber
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
  outgoingChannels: HoprChannel[]
  importanceScore: BigNumber
  stake: BigNumber
}

type HoprNodes = Record<string, HoprNode>;
type HoprChannels = Record<string, HoprChannel>

class HoprNetwork {
  nodes: HoprNodes
  channels: HoprChannels
}

type HoprNetworkHistory = Record<string, HoprNetwork>

let networkHistory: HoprNetworkHistory = {}

const calculateStake = (outgoingChannels) => {
  let stake: BigNumber = new BigNumber(1);
  for (let idx in outgoingChannels) {
    stake = stake.plus(outgoingChannels[idx].balance)
  }
  return stake
}

const copyChannel = (oldChannel) => {
  let newChannel = new HoprChannel();
  newChannel.balance = oldChannel.balance;
  newChannel.dest = oldChannel.dest;
  newChannel.source = oldChannel.source;
  newChannel.weight = oldChannel.weight;
  return newChannel;
}

const copyNode = (oldNode) => {
  let newNode = new HoprNode()
  newNode.account = oldNode.account;
  newNode.importanceScore = oldNode.importanceScore;
  newNode.outgoingChannels = [];
  for (let idx in oldNode.outgoingChannels) {
    newNode.outgoingChannels.push(copyChannel(oldNode.outgoingChannels[idx]));
  }
  newNode.publicKey = oldNode.publicKey;
  newNode.stake = oldNode.stake;

  return newNode;
}

const createNetwork = (nodesByAccount, channelsBySrcDst) => {
  let network = new HoprNetwork();
  let nodes: HoprNodes = {};
  let channels: HoprChannels = {};

  let outgoingChannels: Record<string, HoprChannel[]> = {}

  for (let key in channelsBySrcDst) {
    channels[key] = copyChannel(channelsBySrcDst[key]);
    let sourceAccount = key.split(':')[0];
    if (outgoingChannels[sourceAccount] === undefined) {
      outgoingChannels[sourceAccount] = [];
    }
    outgoingChannels[sourceAccount].push(channelsBySrcDst[key])
  }

  // update outgoingChannels and calculate stake
  for (let key in nodesByAccount) {
    nodes[key] = copyNode(nodesByAccount[key]);
    if (key in outgoingChannels) {
      nodes[key].outgoingChannels = outgoingChannels[key];
      nodes[key].stake = calculateStake(outgoingChannels[key]);
    }
  }

  // for each node, calculate weight
  for (let key in nodes) {
    let totalWeight: BigNumber = new BigNumber(0);
    let node = nodes[key];
    for (let idx in node.outgoingChannels) {
      let channel = node.outgoingChannels[idx];
      let otherNode = nodes[channel.dest];
      let weight = new BigNumber(otherNode.stake).div(node.stake).multipliedBy(channel.balance);
      // console.log("weight " + weight);
      let sqrtWeight = weight.sqrt();
      totalWeight = totalWeight.plus(sqrtWeight);
      // update channel with weight
      let channelKey = channel.source + ":" + channel.dest;
      if (!sqrtWeight.isNaN()) {
        channels[channelKey].weight = sqrtWeight;
      }
    }

    let importanceScore = totalWeight.multipliedBy(node.stake);
    if (!importanceScore.isNaN()) {
      console.log("importanceScore " + importanceScore);
      nodes[key].importanceScore = importanceScore;
    }
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
    console.log("block number: " + block);
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
              channel.balance = new BigNumber(args.amount);
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
              channel.balance = new BigNumber(args.newState[0]);
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
  console.log("number of items in history: " + Object.keys(networkHistory).length);
}

const convertToCytoscape = (nodesByAccount, channelsBySrcDst) => {
  let nodes = [];
  let edges = [];
  for (let id in nodesByAccount) {
    nodes.push({
      'data': {
        'id': id,
        'label': id.substring(0, 10),
        'importance': nodesByAccount[id].importanceScore,
        'stake': nodesByAccount[id].stake
      }
    })
  }
  for (let id in channelsBySrcDst) {
    edges.push({
      'data': {
        'source': channelsBySrcDst[id].source,
        'target': channelsBySrcDst[id].dest,
        'weight': channelsBySrcDst[id].weight,
        'balance': channelsBySrcDst[id].balance,
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
      // find the last block with events in it
      let prevHeight = '0'
      let sortedBlocks = Object.keys(networkHistory).sort((key1, key2) => (key1.localeCompare(key2)))
      for (let idx in sortedBlocks) {
        if (blockHeight < sortedBlocks[idx]) {
          break;
        }
        prevHeight = sortedBlocks[idx];
      }
      network = networkHistory[prevHeight]
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