// import React, { Component } from 'react'
// import vis from 'vis-network'
// import { tree, stratify } from 'd3-hierarchy'
// import clone from 'clone-deep'
// import { select } from 'd3-selection'
// import {
//   forceSimulation,
//   forceCenter,
//   forceManyBody,
//   forceLink,
//   forceX,
//   forceY,
// } from 'd3-force'
// import './NetworkTree.scss'
//
// class NetworkTree extends Component {
//   componentDidUpdate(prevProps) {
//     // const newNodes = this.props.nodes
//     //   .filter(node =>
//     //     !prevProps.nodes.some(oldNode => oldNode.packageString === node.packageString,
//     //     ))
//     //
//     // const newEdges = this.props.edges
//     //   .filter(edge =>
//     //     !prevProps.edges.some(oldEdge => (oldEdge.from === edge.from && oldEdge.to === edge.to),
//     //     ))
//
//     const root = stratify()
//       .id(n => n.target)
//       .parentId(n => n.source)(
//       clone(this.props.links).concat([{ source: '', target: 'react' }])
//     )
//
//     const nodes = root.descendants().reverse()
//     const links = this.tree(root).links()
//
//     const width = 960,
//       height = 500
//
//     const simulation = forceSimulation(nodes)
//       .force('charge', forceManyBody().strength(-100))
//       .force('center', forceCenter(width / 2, height / 2))
//       .force(
//         'link',
//         forceLink(links)
//           .id(node => node)
//           .distance(200)
//       )
//       .force('x', forceX())
//       .force('y', forceY())
//       .alphaTarget(1)
//       .on('tick', ticked)
//
//     const link = this.svg
//       .selectAll('line')
//       .data(links)
//       .join(
//         enter =>
//           enter
//             .append('line')
//             .attr('stroke-width', 1)
//             .attr('stroke', '#999')
//             .attr('stroke-opacity', 0.6),
//         update => update,
//         exit => exit.remove()
//       )
//
//     const node = this.svg
//       .selectAll('.node')
//       .data(nodes)
//       .join(
//         enter => {
//           enter
//             .append('g')
//             .attr(
//               'class',
//               d => 'node' + (d.children ? ' node--internal' : ' node--leaf')
//             )
//
//             .append('circle')
//             .attr('stroke', '#fff')
//             .attr('stroke-width', 1.5)
//             .attr('r', 10)
//             .attr('fill', 'green')
//           //
//           // enter
//           //   .append('text')
//           //   .text(d => d.id)
//
//           return enter
//         },
//         update => update,
//         exit => exit.remove()
//       )
//     // .call(drag())
//
//     function ticked() {
//       // node
//       //   .selectAll('circle')
//       //   .attr('cx', d => d.x)
//       //   .attr('cy', d => d.y)
//       //
//       // link.attr('x1', d => d.source.x)
//       //   .attr('y1', d => d.source.y)
//       //   .attr('x2', d => d.target.x)
//       //   .attr('y2', d => d.target.y)
//     }
//
//     // newNodes.forEach(node => {
//     //   this.nodes.add({
//     //     id: node.packageString,
//     //     label: node.packageString,
//     //   })
//     // })
//     //
//     // newEdges.forEach(edge => {
//     //   this.edges.add(edge)
//     // })
//     //
//     // const nodes = new vis.DataSet(
//     //   this.props.nodes.map(node => ({
//     //     id: node.packageString,
//     //     label: node.packageString,
//     //   })),
//     // )
//
//     // const edges = new vis.DataSet(this.props.edges)
//     // this.network.setData({ nodes, edges })
//   }
//
//   componentDidMount() {
//     this.nodes = new vis.DataSet([])
//     this.edges = new vis.DataSet([])
//
//     const container = document.getElementById('network-tree')
//     const data = {
//       nodes: this.nodes,
//       edges: this.edges,
//     }
//     const options = {
//       layout: {
//         hierarchical: {
//           enabled: true,
//           levelSeparation: 100,
//           nodeSpacing: 150,
//           treeSpacing: 200,
//           blockShifting: false,
//           edgeMinimization: false,
//           parentCentralization: true,
//           direction: 'UD', // UD, DU, LR, RL
//           sortMethod: 'directed', // hubsize, directed
//           shakeTowards: 'roots', // roots, leaves
//         },
//       },
//     }
//
//     const width = 960,
//       height = 500
//
//     this.svg = select('#network-tree')
//       .append('svg')
//       .attr('width', width)
//       .attr('height', height)
//
//     this.tree = tree().size([height, width])
//
//     // this.network = new vis.Network(container, data, options)
//   }
//
//   render() {
//     return <div id="network-tree"></div>
//   }
// }
//
// export default NetworkTree

export default () => null
