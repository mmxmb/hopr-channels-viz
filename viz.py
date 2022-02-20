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

stylesheet = [
    {
        "selector": "node",
        "style": {"background-color": "#BFD7B5", "label": "data(label)"},
    },
    {
        "selector": "edge",
        "style": {
            "curve-style": "bezier",
            "target-arrow-shape": "chevron",
            "target-arrow-color": "red",
            "arrow-scale": 1,
            "width": 1,
        },
    },
    {
        "selector": "[weight > 10]",
        "style": {
            "width": 10,
        },
    },
    {
        "selector": "[importance > 10]",
        "style": {
            "width": 10,
        },
    },
]

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
}


def get_graph_elements(blockheight):
    resp = requests.get(
        f"http://127.0.0.1:3000/network?format=cytoscape&blockHeight={blockheight}"
    )
    if not resp.ok:
        print(f"resp not OK: {resp.status_code} {resp.text}")
        return [], []

    elements = resp.json()
    nodes, edges = elements["nodes"], elements["edges"]
    nodes_by_id = {node["data"]["id"]: node for node in nodes}
    connected_node_addresses = set()
    for edge in edges:
        connected_node_addresses.add(edge["data"]["source"])
        connected_node_addresses.add(edge["data"]["target"])

    connected_nodes = []
    for addr in connected_node_addresses:
        connected_nodes.append(nodes_by_id[addr])
    return connected_nodes, edges


app.layout = html.Div(
    id="cytoscape-hopr-channels-container",
    style=styles["container"],
    children=[
        html.H1(
            "HOPR Channels Visualization",
            style=styles["h1"],
        ),
        html.Div(
            style=styles["slider"],
            children=[
                dcc.Slider(
                    20307201,
                    20637852,
                    1,
                    marks=None,
                    value=20607201,
                    id="blockheight-slider",
                    tooltip={"placement": "bottom", "always_visible": True},
                    updatemode="drag",
                ),
            ],
        ),
        cyto.Cytoscape(
            id="cytoscape-hopr-channels",
            layout=layout,
            style=styles["cytoscape"],
            stylesheet=stylesheet,
            elements=[],
            minZoom=0.25,
            zoom=1,
            maxZoom=2,
        ),
        html.Pre(id="cytoscape-hopr-details", style=styles["pre"]),
    ],
)


@app.callback(
    Output("cytoscape-hopr-details", "children"),
    Input("cytoscape-hopr-channels", "tapNodeData"),
    Input("cytoscape-hopr-channels", "tapEdgeData"),
)
def display_tap_details(tap_node_data, tap_edge_data):
    ctx = dash.callback_context
    if ctx.triggered:
        tap_event = ctx.triggered[0]["prop_id"].split(".")[1]
        if tap_event == "tapEdgeData":
            return json.dumps(tap_edge_data, indent=2)
        if tap_event == "tapNodeData":
            return json.dumps(tap_node_data, indent=2)
    return ""


@app.callback(
    Output("cytoscape-hopr-channels", "elements"),
    Input("blockheight-slider", "value"),
    State("cytoscape-hopr-channels", "elements"),
)
def update_output(blockheight, elements):
    connected_nodes, edges = get_graph_elements(blockheight)
    return connected_nodes + edges


if __name__ == "__main__":
    app.run_server(debug=True)
