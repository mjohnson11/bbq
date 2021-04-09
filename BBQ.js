
var main_data_aq;
var alphas;
var mutation_data;
var mutation_data_aq;
var geno_mapper;
var geno_lines;
var geno_path;
var geno_markers = [];
var main_svg;
var bottom_svg_line;
var bottom_svg_text;
var indices;
var geno_positions;

var pixel_hover_range = 15 // 15 is minimum pixel for hover behavior

var graph_counter = 0;
var hover_circles = {};
var canvas_graphs = [];

var canvasWidth = 1200;
var canvasHeight = 750;

var chromo_lens = [230218,813184,316620,1531933,576874,270161,1090940,562643,439888,745751,666816,1078177,924431,784333,1091291,948066];

var baseline = 0

var chromo_ranges = [];
for (let cl of chromo_lens) {
  let clp = (Math.floor(cl/20000)+1)*2;
  chromo_ranges.push({'start': baseline, 'end': baseline+clp});
  baseline += clp;
}

var ctx;
var canvasData;

var variants_in_selection;
var data_by_variants = {};

var hoverMap = [];
for (let i=0; i<canvasWidth; i++) {
  hoverMap.push([]);
  for (let j=0; j<canvasHeight; j++) {
    hoverMap[i].push({'variant': -1, 'dist': pixel_hover_range}); 
  }
}

// DRAWING

// That's how you define the value of a pixel //
//https://stackoverflow.com/questions/7812514/drawing-a-dot-on-html5-canvas//
function drawPixel(x, y, r, g, b, a, blend_factor) {
  let index = (x + y * canvasWidth) * 4;
  canvasData.data[index + 0] = canvasData.data[index + 0]-(canvasData.data[index + 0]-r)/blend_factor;
  canvasData.data[index + 1] = canvasData.data[index + 1]-(canvasData.data[index + 1]-g)/blend_factor;
  canvasData.data[index + 2] = canvasData.data[index + 2]-(canvasData.data[index + 2]-b)/blend_factor;
  canvasData.data[index + 3] = a;
}

function drawPixelSimple(x, y, r, g, b) {
  let index = (x + y * canvasWidth) * 4;
  canvasData.data[index + 0] = r;
  canvasData.data[index + 1] = g;
  canvasData.data[index + 2] = b;
}

function clearImageData() {
  for (let i=0; i<canvasData.data.length; i++) {
    canvasData.data[i]=255;
  }
}

function drawPoint(x,y,r,g,b,a,size_radius,blend_factor) {
  let corner_cutoff = Math.max(size_radius-1, 1);
  corner_cutoff = corner_cutoff*corner_cutoff;
  for (let i=0; i<size_radius; i++) {
    for (let j=0; j<size_radius; j++) {
      if ((i*i+j*j) <= corner_cutoff) {  // to make it a circle
        drawPixel(x-i-1, y-j-1, r, g, b, a, blend_factor);
        drawPixel(x+i, y-j-1, r, g, b, a, blend_factor);
        drawPixel(x-i-1, y+j, r, g, b, a, blend_factor);
        drawPixel(x+i, y+j, r, g, b, a, blend_factor);
      }
    }
  }
}


class CanvasGraph {
  /* Base class for everything that gets drawn */
  constructor(dimensions, xvar, yvar, possible_xs, possible_ys) {
    graph_counter += 1
    this.graph_name = 'WowG' + String(graph_counter);
    this.hover_circle = main_svg.append('circle')
      .attr('r', 5)
      .attr('cx', 100)
      .attr('cy', 100)
      .attr('fill', 'none')
      .attr('stroke', '#000000')
      .attr('opacity', 0);
    [this.left, this.top, this.w, this.h] = dimensions;
    this.xvar = xvar;
    this.yvar = yvar;
    let self = this;
    this.svg = main_svg;
    this.graph_stuff = this.svg.append('g');
    
    this.x_axis = this.graph_stuff.append('g').attr("transform", "translate(0," + String(self.top+self.h) + ")");
    this.y_axis = this.graph_stuff.append('g').attr("transform", "translate(" + String(self.left) + ",0)");

    this.xlabel = this.svg.append('foreignObject')
      .attr('x', self.left+self.w/2-50)
      .attr('y', self.top+self.h+20)
      .attr('width', 100)
      .attr('height', 20)
      .attr('class', 'axis_label_foreign_obj');
    this.xlabel_dropdown = this.xlabel.append('xhtml:select')
      .attr('class', 'axis_label_select')
      .on('change', function() {
        self.set_x(d3.select(this).property('value'));
        console.log('Changing x to', self.xvar);
        draw_right();
      })
      .selectAll('option')
        .data(possible_xs)
        .enter()
        .append('option')
          .attr('value', d => d)
          .property('selected', d => d==self.xvar)
          .html(d => d);

    this.ylabel = this.svg.append('foreignObject')
      .attr('x', self.left-50)
      .attr('y', self.top-25)
      .attr('width', 100)
      .attr('height', 20)
      .attr('class', 'axis_label_foreign_obj');
    this.ylabel_dropdown = this.ylabel.append('xhtml:select')
      .attr('class', 'axis_label_select')
      .on('change', function() {
        self.set_y(d3.select(this).property('value'));
        console.log('Changing y to', self.yvar);
        draw_right();
      })
      .selectAll('option')
        .data(possible_ys)
        .enter()
        .append('option')
          .attr('value', d => d)
          .property('selected', d => d==self.yvar)
          .html(d => d);
    
    self.set_x(self.xvar);
    self.set_y(self.yvar);
  }

  set_x(xvar) {
    let self = this;
    this.xvar = xvar;
    this.x_domain = d3.extent(main_data_aq.columnArray(self.xvar));
    let x_d_dif = this.x_domain[1] - this.x_domain[0];
    this.x_domain[0] = this.x_domain[0] - x_d_dif/10;
    this.x_domain[1] = this.x_domain[1] + x_d_dif/10;
    this.xs = d3.scaleLinear().domain(self.x_domain).range([self.left, self.left+self.w]);
    this.x_axis.call(d3.axisBottom().scale(self.xs).ticks(4));
    this.x_exact = d3.range(main_data_aq._nrows).map((i) => self.xs(main_data_aq.get(self.xvar, i)));
    this.x = self.x_exact.map((d) => Math.round(d));
  }

  set_y(yvar) {
    let self = this;
    this.yvar = yvar;
    this.y_domain = d3.extent(main_data_aq.columnArray(self.yvar));
    let y_d_dif = this.y_domain[1] - this.y_domain[0];
    this.y_domain[0] = this.y_domain[0] - y_d_dif/10;
    this.y_domain[1] = this.y_domain[1] + y_d_dif/10;
    this.ys = d3.scaleLinear().domain(self.y_domain).range([self.top+self.h, self.top]);
    this.y_axis.call(d3.axisLeft().scale(self.ys).ticks(4));
    this.y_exact = d3.range(main_data_aq._nrows).map((i) => self.ys(main_data_aq.get(self.yvar, i)));
    this.y = self.y_exact.map((d) => Math.round(d));
  }

  draw(indices, alpha) {
    let self = this;
    for (let i of indices) {
      drawPoint(self.x[i], self.y[i], 0, 0, 0, alpha, 1, 4);
    }
  }

  draw_brush_only() {
    let self = this;
    self.draw(d3.range(main_data_aq._nrows), 100);
    self.draw(variants_in_selection, 255);
  }

} 

function draw_data() {
  clearImageData();
  for (let cg of canvas_graphs) {
    cg.draw(d3.range(main_data_aq._nrows), 255);
  }
  ctx.putImageData(canvasData, 0, 0);
}

function draw_brush_only() {
  clearImageData();
  for (let cg of canvas_graphs) {
    cg.draw_brush_only();
  }
  ctx.putImageData(canvasData, 0, 0);
}

function draw_right() {
  if (variants_in_selection.length==0) {
    draw_data();
  } else {
    console.log('y');
    draw_brush_only();
  }
  update_hover_map();
}

// INTERACTION

function check_for_hover_call(x, y, xe, ye, var_ind) { // xo and yo are the corresponding points coordinates (from the violin plot or main plot)
  for (let i=-1*pixel_hover_range; i<pixel_hover_range+1; i++) {
    let tmp_x = x+i;
    for (let j=-1*pixel_hover_range; j<pixel_hover_range+1; j++) {
      let tmp_y = y+j;
      if ( ((tmp_x>-1) && (tmp_x<canvasWidth))  && ((tmp_y>-1) && (tmp_y<canvasHeight)) ) {
        let dist = Math.sqrt((tmp_x-xe)**2 + (tmp_y-ye)**2);
        if (dist < hoverMap[tmp_x][tmp_y]['dist']) {
          hoverMap[tmp_x][tmp_y]['dist'] = dist;
          hoverMap[tmp_x][tmp_y]['variant'] = var_ind;
        }
      }
    }
  }
}

function update_hover_map() {
  for (let i=0; i<canvasWidth; i++) {
    for (let j=0; j<canvasHeight; j++) {
      hoverMap[i][j] = {'variant': -1, 'dist': pixel_hover_range}; 
    }
  }
  for (let i=0; i<main_data_aq._nrows; i++) {
    for (let cg of canvas_graphs) {
      let [x, y, xe, ye] = [cg.x[i], cg.y[i], cg.x_exact[i], cg.y_exact[i]];
      check_for_hover_call(x, y, xe, ye, i);
    }
  }
}

function check_extent(extent, i, canvas_graphs) {
  let in_extent = false;
  for (let cg of canvas_graphs) {
    if (extent[0][0] <= cg.x[i] && cg.x[i] <= extent[1][0] && extent[0][1] <= cg.y[i] && cg.y[i] <= extent[1][1]) {
      in_extent = true;
    }
  }
  return in_extent;
}

function process_brush(event) {
  let extent = event.selection;
  if (!event.sourceEvent.metaKey) {
    variants_in_selection = [];
  }
  if (extent) {
    for (let i=0; i<main_data_aq._nrows; i++) {
      in_extent = check_extent(extent, i, canvas_graphs);
      if (in_extent) {
        variants_in_selection.push(i);
      } 
    }
  }
  if (variants_in_selection.length == 0) {
    draw_data();
  } else {
    draw_brush_only();
    brush_geno_plot();
  }
}

function setup_interaction() {
  update_hover_map();
  main_svg.on('mousemove', function(event, d) {
    let [mx, my] = d3.pointer(event, this);
    let hover_el = hoverMap[Math.round(mx)][Math.round(my)];
    if (hover_el) {
      let var_ind = hover_el['variant'];
      if (var_ind > -1) {
        hover_geno_plot(var_ind);
        for (let cg of canvas_graphs) {
          cg.hover_circle
            .attr('cx', cg.x[var_ind])
            .attr('cy', cg.y[var_ind])
            .attr('fill', '#CC3333')
            .attr('opacity', 1);
        }
      } else {
        for (let cg of canvas_graphs) {
          cg.hover_circle.attr('opacity', 0);
        }
      }
    }
  });
  main_svg.on('click', function(event, d) {
    let [mx, my] = d3.pointer(event, this);
    let hover_el = hoverMap[Math.round(mx)][Math.round(my)];
    if (hover_el>-1) {
      console.log(hover_el);
      
    }
  });
  
  // adding brushing https://www.d3-graph-gallery.com/graph/interactivity_brush.html
  main_svg.call( d3.brush()                 // Add the brush feature using the d3.brush function
      .extent( [ [0,40], [canvasWidth,480] ] ) // initialise the brush area: start at 0,0 and finishes at width,height: it means I select the whole graph area
      .on("end", function(event) { process_brush(event); }) // Each time the brush selection changes, trigger the 'process_brush' function
    )
}

function setup_geno_plot() {

  d3.select('#loading_message').remove();
  // getting average genotype for all variants
  let tmp = [];
  for (let gp of geno_positions) {
    let i = gp[0];
    tmp.push([i*2, 75-d3.mean(d3.range(mutation_data.length).filter(d => mutation_data[d][i]!=0).map(d => mutation_data[d][i]))*48]);
  }

  d3.select('#bbq_svg2').append('path')
    .attr('stroke', 'blue')
    .attr('fill', 'none')
    .attr('stroke-width', 1)
    .attr('d', d3.line()(tmp));

  geno_path = d3.select('#bbq_svg2').append('path')
    .attr('stroke', '#000000')
    .attr('fill', 'none')
    .attr('stroke-width', 3);

  d3.select('#bbq_svg2').selectAll('.chromo_range')
    .data(chromo_ranges)
    .enter()
    .append('rect')
      .attr('x', (d) => d.start)
      .attr('width', (d) => d.end-d.start)
      .attr('y', 25)
      .attr('height', 100)
      .attr('fill', '#000000')
      .attr('opacity', (d, i) => [0.2, 0][i%2]);

  bottom_svg_line = d3.select('#bbq_svg2').append('line')
    .attr('stroke', '#333333')
    .attr('stroke-width', 2)
    .attr('opacity', 0.6)
    .attr('y1', 25)
    .attr('y2', 125);
  bottom_svg_text = d3.select('#bbq_svg2').append('text')
    .attr('class', 'bbq_label')
    .attr('opacity', 0.6)
    .attr('y', 140);

  d3.select('#bbq_svg2')
    .on('mousemove', function(event) {
      let pos = d3.pointer(event)[0];
      bottom_svg_line.attr('x1', pos).attr('x2', pos);
      bottom_svg_text.attr('x', pos).html(geno_mapper[Math.round(pos/2)]);
    })
    .on('mouseout', function() {
      console.log('out');
    })
    .on('click', function(event) {
      if (event.metaKey) {
        geno_markers.pop().remove();
      } else {
        let pos = d3.pointer(event)[0];
        let tmp_group = d3.select('#bbq_svg2').append('g');
        tmp_group.append('line')
          .attr('stroke', '#333333')
          .attr('stroke-width', 2)
          .attr('y1', 25)
          .attr('y2', 125)
          .attr('x1', pos)
          .attr('x2', pos);
        tmp_group.append('text')
          .attr('class', 'bbq_label')
          .attr('y', 22)
          .attr('x', pos)
          .html(geno_mapper[Math.round(pos/2)]);
        geno_markers.push(tmp_group);
      }
    })
}

function setup_viz() {
  canvas = document.getElementById("bbq_canvas");
  main_svg = d3.select("#bbq_svg");
  ctx = canvas.getContext("2d");
  canvasData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  let cols = main_data_aq._names.filter(d => d != 'variant');
  canvas_graphs.push(new CanvasGraph([80, 40, 500, 480], '4NQO', 'li', cols, cols));
  canvas_graphs.push(new CanvasGraph([650, 40, 500, 480], 'cu', 'eth', cols, cols));
  draw_data();
  d3.select('#bbq_svg2').append('text')
    .attr('class', 'bbq_label')
    .attr('id', 'loading_message')
    .attr('y', 100)
    .attr('x', 580)
    .html('loading genotype data...');
  setup_interaction();
}

function brush_geno_plot() {
  let tmp = [];
  //let filtered_md = mutation_data_aq.params({fv: variants_in_selection}).filter((d, $) => op.includes($.fv, d.index));
  for (let gp of geno_positions) {
    let i = gp[0];
    //let tmp_col = mutation_data_aq.columnArray('locus_'+String(i));
    tmp.push([i*2, 75-d3.mean(variants_in_selection.filter(d => mutation_data[d][i]!=0).map(d => mutation_data[d][i]))*48]);
    //let tmp_sum = filtered_md.rollup({'tmp': (d) => op.mean(d.index)}).get('tmp', 0);
    //tmp.push([i*2, 75-tmp_sum*45]);
  }
  geno_path.attr('d', d3.line()(tmp));
}

function hover_geno_plot(row_index) {
  let tmp = mutation_data[row_index];
  //console.log(tmp);
  for (let gp of geno_positions) {
    let i = gp[0];
    let color_nums;
    if (isNaN(tmp[i])) {
      color_nums = [255, 255]; // white it out if no call
    } else {
      color_nums = [((tmp[i]+1)/2)*255];
      color_nums.push(255-color_nums[0]);
    }
    for (let j=0; j<2; j++) {
      for (let k=0; k<2; k++) {
        drawPixelSimple(i*2+j, 675+50+k, color_nums[0], color_nums[0], color_nums[0]);
        drawPixelSimple(i*2+j, 675-52+k, color_nums[1], color_nums[1], color_nums[1]);
      }
    }
  }
  ctx.putImageData(canvasData, 0, 0);
}

function go_bbq() {
  console.log('starting bbq viz...')
  aq.loadArrow('data/combined_phenotypes.arrow').then(function(td) {
    main_data_aq = td;
    variants_in_selection = [];
    setup_viz();
    aq.loadArrow('data/bbq_data_pinned_downsampled_20K.arrow').then(function(td) {
      mutation_data_aq = td.assign(aq.table({'index': d3.range(td._nrows)}));
      d3.csv('data/geno_map.csv').then(function(geno_map) {
        geno_mapper = geno_map.map(d => d.geno_pos);
        geno_positions = [];
        for (let i=0; i<611; i++) {
          let tmp_col = mutation_data_aq.columnArray('locus_'+String(i));
          if ((tmp_col.indexOf(-1)>-1) || (tmp_col.indexOf(1)>-1)) { // this column has some genotype data, add to the list
            geno_positions.push([i, geno_mapper[i]]);
          }
        }
        mutation_data = [];
        for (let row of mutation_data_aq.objects()) {
          let tmp = []
          for (let i=0; i<611; i++) {
            tmp.push(row['locus_'+String(i)]);
          }
          mutation_data.push(tmp)
        }
        setup_geno_plot();
      });
    });
  });
}

function toggle_about() {
  let new_style = (d3.select('#bbq_about_div').style('display')=='none') ? 'block' : 'none';
  d3.select('#bbq_about_div').style('display', new_style);
}