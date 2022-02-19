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
}

class HoprNode {
  // todo change type to Account
  account: string;
  publicKey: string;
}

type HoprNodes = Record<string, HoprNode>;

type HoprChannels = Record<string, HoprChannel>

let nodesByAccount: HoprNodes = {};
let channelsBySrcDst: HoprChannels = {};

const processHoprEvents = () => {
  let sortedBlocks = Object.keys(data.blocks).sort((key1, key2) => (key1.localeCompare(key2)))

  let numChannelsOpened = 0
  let numChannelsClosed = 0

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
  }

  console.log("channelsOpened/Closed: " + numChannelsOpened + "/" + numChannelsClosed);
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
  if (request.query['format'] === 'cytoscape') {
    response.status(200).json(convertToCytoscape(nodesByAccount, channelsBySrcDst));
  } else {
    response.status(200).json({ nodes: nodesByAccount, channels: channelsBySrcDst })
  }

};
app.get('/network', getHoprNetwork);

