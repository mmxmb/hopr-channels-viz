import dash
import json
import dash_cytoscape as cyto
import requests
from dash import html
from dash import dcc
from dash.dependencies import Input, Output, State

cyto.load_extra_layouts()

app = dash.Dash(__name__)
app.title = "HOPR Channels Viz"

HOPR_CHANNELS_CREATION_BLOCKHEIGHT = 0
HOPR_CHANNELS_LAST_INDEXED_BLOCKHEIGHT = 2691

# https://github.com/cytoscape/cytoscape.js-klay
layout = {
    "name": "klay",
    "klay": {
        "nodePlacement": "BRANDES_KOEPF",
        "nodeLayering": "LONGEST_PATH",
        "spacing": 20,
        "thoroughness": 3,
    },
    "animate": "true",
    "animationDuration": 200,
}

styles = {
    "h1": {"text-align": "center"},
    "pre": {
        "height": "10vh",
        "border": "thin lightgrey solid",
        "background-color": "#fffea5",  # hopr yellow
        "overflowX": "scroll",
    },
    "slider": {"border-bottom": "thin lightgrey solid"},
    "cytoscape": {"width": "100%", "height": "90vh"},
    "container": {
        "background-color": "#f8f8ff",
        "position": "absolute",
        "top": "0",
        "right": "0",
        "bottom": "0",
        "left": "0",
        "display": "flex",
        "flex-direction": "column",
    },
    "title": {
        "display": "flex",
        "flex-direction": "row",
        "padding": "0px 20px 0px 20px",
        "justify-content": "space-around",
    },
}


def edge_weight_range(edges):
    weights = []
    for e in edges:
        if "weight" in e["data"]:
            weight = int(float(e["data"]["weight"]))
            if weight > 0:
                weights.append(weight)
    if weights:
        return min(weights), max(weights)
    return 0, 0


def node_importance_range(nodes):
    importances = []
    for n in nodes:
        if "stake" in n["data"]:
            importance = int(float(n["data"]["stake"]))
            if importance > 0:
                importances.append(importance)
    if importances:
        return min(importances), max(importances)
    return 0, 0


# nodes with at least one channel open
def get_connected_nodes(nodes, edges):
    nodes_by_id = {node["data"]["id"]: node for node in nodes}
    connected_node_addresses = set()
    for edge in edges:
        connected_node_addresses.add(edge["data"]["source"])
        connected_node_addresses.add(edge["data"]["target"])

    connected_nodes = []
    for addr in connected_node_addresses:
        connected_nodes.append(nodes_by_id[addr])
    return connected_nodes


def graph_elements(blockheight):
    resp = requests.get(
        f"http://127.0.0.1:3000/network?format=cytoscape&blockHeight={blockheight}"
    )
    if not resp.ok:
        print(f"resp from API server not OK: {resp.status_code} {resp.text}")
        return [], []

    elements = resp.json()
    nodes, edges = elements["nodes"], elements["edges"]

    return get_connected_nodes(nodes, edges), edges


app.layout = html.Div(
    id="cytoscape-hopr-channels-container",
    style=styles["container"],
    children=[
        html.Div(
            style=styles["title"],
            children=[
                html.H1(
                    "HOPR Channels Visualization",
                    style=styles["h1"],
                ),
                html.H3(
                    id="blockheight" "",
                    style=styles["h1"],
                ),
            ],
        ),
        html.Div(
            style=styles["slider"],
            children=[
                dcc.Slider(
                    HOPR_CHANNELS_CREATION_BLOCKHEIGHT,
                    HOPR_CHANNELS_LAST_INDEXED_BLOCKHEIGHT,
                    1,
                    marks=None,
                    value=2691,  # random block height that looks alright
                    id="blockheight-slider",
                    tooltip={"placement": "bottom", "always_visible": False},
                    updatemode="drag",
                ),
            ],
        ),
        cyto.Cytoscape(
            id="cytoscape-hopr-channels",
            layout=layout,
            style=styles["cytoscape"],
            stylesheet=[],
            elements=[],
            minZoom=0.25,
            zoom=1,
            maxZoom=2,
        ),
        html.P(id="cytoscape-hopr-details", style=styles["pre"]),
        dcc.Link(
            "HoprChannels contract",
            href="https://blockscout.com/xdai/mainnet/address/0xD2F008718EEdD7aF7E9a466F5D68bb77D03B8F7A/transactions",
            style=styles["h1"],
        ),
    ],
)


def addr_link(addr):
    return f"https://blockscout.com/xdai/mainnet/address/{addr}/transactions"


@app.callback(
    Output("cytoscape-hopr-details", "children"),
    Input("cytoscape-hopr-channels", "tapNodeData"),
    Input("cytoscape-hopr-channels", "tapEdgeData"),
)
def display_tap_details(tap_node_data, tap_edge_data):
    ctx = dash.callback_context
    details = []
    if ctx.triggered:
        tap_event = ctx.triggered[0]["prop_id"].split(".")[1]
        if tap_event == "tapEdgeData":
            for k, v in tap_edge_data.items():
                if k == "id":
                    continue
                elif k == "source" or k == "target":
                    details.append(f"{k}: ")
                    details.append(html.A(f"{v}", href=addr_link(v), target="_blank"))
                    details.append(f" ")
                else:
                    details.append(f"{k}: {v} ")
        elif tap_event == "tapNodeData":
            for k, v in tap_node_data.items():
                if k == "id":
                    details.append(f"address: ")
                    details.append(html.A(f"{v}", href=addr_link(v), target="_blank"))
                    details.append(f" ")
                else:
                    details.append(f"{k}: {v} ")
    return details


def edge_weight_styles(edges, n):
    styles = []
    min_weight, max_weight = edge_weight_range(edges)
    weight_classes = [
        min_weight + ((max_weight - min_weight) / (n - 1)) * i for i in range(n)
    ]
    for width, weight in enumerate(weight_classes, 1):
        styles.append(
            {
                "selector": f"[weight > {weight}]",
                "style": {
                    "width": width,
                },
            },
        )
    return styles


def node_appearance_styles(nodes):
    styles = []
    colors = ["#0516b1", "#1c299e" "#3443cf", "#081373"]
    min_importance, max_importance = node_importance_range(nodes)
    importance_classes = [
        min_importance + ((max_importance - min_importance) / (len(colors) - 1)) * i
        for i in range(len(colors))
    ]
    default_size = 20
    for size_multiplier, (importance, color) in enumerate(
        zip(importance_classes, colors), 1
    ):
        styles.append(
            {
                "selector": f"[stake > {importance}]",
                "style": {
                    "background-color": color,
                    "width": default_size + (15 * size_multiplier),
                    "height": default_size + (15 * size_multiplier),
                },
            },
        )
    return styles


@app.callback(
    Output("cytoscape-hopr-channels", "elements"),
    Output("cytoscape-hopr-channels", "stylesheet"),
    Output("blockheight", "children"),
    Input("blockheight-slider", "value"),
    State("cytoscape-hopr-channels", "elements"),
    State("cytoscape-hopr-channels", "stylesheet"),
)
def update_output(blockheight, elements, stylesheet):
    connected_nodes, edges = graph_elements(blockheight)
    stylesheet = [
        {
            "selector": "node",
            "style": {"background-color": "#6675ff", "label": "data(label)"},
        },
        {
            "selector": "edge",
            "style": {
                "curve-style": "bezier",
                "target-arrow-shape": "chevron",
                "target-arrow-color": "purple",
                "arrow-scale": 1.5,
                "width": 1,
            },
        },
    ]
    stylesheet.extend(edge_weight_styles(edges, 5))
    stylesheet.extend(node_appearance_styles(connected_nodes))
    return connected_nodes + edges, stylesheet, f"Block height: {blockheight}"


if __name__ == "__main__":
    app.run_server(debug=True)
