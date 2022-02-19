import dash
import json
import dash_cytoscape as cyto
from dash import html
from dash import dcc
from dash.dependencies import Input, Output

cyto.load_extra_layouts()


app = dash.Dash(__name__)

style = {"width": "100%", "height": "90vh"}

stylesheet = [
    {
        "selector": "node",
        "style": {"background-color": "#BFD7B5", "label": "data(label)"},
    }
]

# https://github.com/cytoscape/cytoscape.js-klay
layout = {
    "name": "klay",
    "klay": {
        "nodePlacement": "BRANDES_KOEPF",
        "spacing": 100,
    },
}

styles = {
    "pre": {
        "width": "100%",
        "height": "10vh",
        "border": "thin lightgrey solid",
        "background-color": "#fffea5",  # hopr yellow
        "overflowX": "scroll",
    },
    "container": {
        "background-color": "#f8f8ff"
    }
}

nodes = [
    {"data": {"id": "one", "label": "Node 1"}},
    {"data": {"id": "two", "label": "Node 2"}},
]

edges = [{"data": {"source": "one", "target": "two", "label": "Node 1 to 2"}}]

app.layout = html.Div(
    id="cytoscape-hopr-channels-container",
    style=styles["container"],
    children=[
        # html.H1('HOPR Channels Visualization'),
        cyto.Cytoscape(
            id="cytoscape-hopr-channels",
            layout=layout,
            style=style,
            stylesheet=stylesheet,
            elements=nodes + edges,
        ),
        html.Pre(id="cytoscape-hopr-node-json", style=styles["pre"]),
    ]
)


@app.callback(
    Output("cytoscape-hopr-node-json", "children"),
    Input("cytoscape-hopr-channels", "tapNodeData"),
)
def displayTapNodeData(data):
    return json.dumps(data, indent=2)


if __name__ == "__main__":
    app.run_server(debug=True)
