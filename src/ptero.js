var fetchWorkflowSkeleton = function(workflowId, callingContext) {
  var url = "/ptero/v1/reports/workflow-skeleton?workflow_id=" + workflowId;
  $.ajax({
    url: url,
    dataType: 'json',
    cache: false,
    success: function(data) {
      fetchWorkflowExecutions(workflowId, data, callingContext);
    },
    error: function(xhr, status, err) {
      console.error(url, status, err.toString());
    }
  });
}

var fetchWorkflowExecutions = function(workflowId, workflowSkeleton, callingContext) {
  var url = "/ptero/v1/reports/workflow-executions?workflow_id=" + workflowId;
  $.ajax({
    url: url,
    dataType: 'json',
    cache: false,
    success: function(data) {
      processWorkflowData(workflowSkeleton, data, callingContext);
    },
    error: function(xhr, status, err) {
      console.error(url, status, err.toString());
    }
  });
}

var processWorkflowData = function(skeleton, executions, callingContext) {
  var indexedExecutions = indexExecutions(executions.executions);
  var rootExecution = indexedExecutions.tasks[skeleton.rootTaskId][0];
  var rows = [];
  rows.push({
    type: "workflow",
    status: skeleton.status,
    name: skeleton.name,
    timestamp: getTimestampForStatusAndHistory(skeleton.status, rootExecution.statusHistory),
    nestingLevel: 0
  });

  processTasks(skeleton.tasks, indexedExecutions, 1, null, rows);
  callingContext.setState({rows: rows});
}

var indexExecutions = function(executions) {
  var indexedExecutions = { methods: {}, tasks: {} }

  executions.forEach(function (element, index, array) {
    var executionType;
    var id;
    if (element.hasOwnProperty("taskId")) {
      executionType = 'tasks';
      id = element.taskId;
    } else if (element.hasOwnProperty("methodId")) {
      executionType = 'methods';
      id = element.methodId;
    } else {
      console.error("Unknown key!");
    }

    if (!indexedExecutions[executionType].hasOwnProperty(id)) {
      indexedExecutions[executionType][id] = []
    }
    indexedExecutions[executionType][id].push(element);
  });

  return indexedExecutions;
}


var processTasks = function(tasks, indexedExecutions, nestingLevel, color, rows) {
  var sortedTaskKeys = getSortedTaskKeys(tasks);
  sortedTaskKeys.forEach(function (taskKey, index, array) {
    var task = tasks[taskKey];
    var executions = indexedExecutions.tasks[task.id];
    executions.forEach(function(execution, index, array) {
      if (execution.parentColor == color) {
        getStatusInfoRowsForTaskExecution(taskKey, task, execution, indexedExecutions, nestingLevel, rows);
      }
    });
  });
  return rows;
}

var getSortedTaskKeys = function(tasks) {
    return Object.keys(tasks).sort(function(a, b) {
      return tasks[a].topologicalIndex - tasks[b].topologicalIndex;
    });
}

var getStatusInfoRowsForTaskExecution = function(name, task, execution, indexedExecutions, nestingLevel, rows) {
  rows.push({
    name: name,
    status: execution.status,
    timestamp: getTimestampForStatusAndHistory(execution.status, execution.statusHistory),
    nestingLevel: nestingLevel,
    type: 'task'
  });
  processMethods(task, execution, indexedExecutions, nestingLevel + 1, rows);
}

var processMethods = function(task, execution, indexedExecutions, nestingLevel, rows) {
  task.methods.forEach(function(method, index, methods) {
    getStatusInfoRowsForMethod(method, execution.color, indexedExecutions, nestingLevel, rows);
  });
}
var getStatusInfoRowsForMethod = function(method, color, indexedExecutions, nestingLevel, rows) {
  var executions = indexedExecutions.methods[method.id];
  executions.filter(function (e) { return e.parentColor == color; }).forEach(function (execution, index, executions) {
    rows.push({
      name: method.name,
      status: execution.status,
      timestamp: getTimestampForStatusAndHistory(execution.status, execution.statusHistory),
      nestingLevel: nestingLevel,
      type: method.service,
    });
    if (method.service == "workflow") {
      processTasks(method.parameters.tasks, indexedExecutions, nestingLevel + 1, execution.color, rows);
    }
  });
}

var getTimestampForStatusAndHistory = function(status, history) {
  var statuses = history.filter(function (statusUpdate) {
    return statusUpdate.status == status;
  });
  return statuses[0].timestamp;
}

var getClassNameForWorkflowStatus = function(status) {
  var className;
  switch(status) {
    case "succeeded":
      className = "success";
      break;
    case "running":
      className = "info";
      break;
    case "failed":
      className = "danger";
      break;
    default:
      className = "";
  }
  return className;
}

var spacersForNestingLevel = function(nestingLevel) {
  var i = nestingLevel;
  var accum = [];
  while (i > 0) {
    accum.push(<span className="glyphicon glyphicon-arrow-right" aria-hidden={true}/>);
    i--;
  }
  return accum;
}

var headerForMaxIndent = function(maxIndent) {
  var i = maxIndent + 4;
  var accum = [];
  while (i > 0) {
    accum.push(<th className="col-md-1"/>);
    i--;
  }
  return accum;
}

var leadingBlankCellsForRow = function(row) {
  var i = row.nestingLevel;
  var accum = [];
  while (i > 0) {
    accum.push(<td><span className="glyphicon glyphicon-arrow-right" aria-hidden={true}/></td>);
    i--;
  }
  return accum;
}

var trailingBlankCellsForRow = function(row, maxIndent) {
  var i = maxIndent - row.nestingLevel;
  var accum = [];
  while (i > 0) {
    accum.push(<td></td>);
    i--;
  }
  return accum;
}

var maxIndentForRows = function(rows) {
  return rows.reduce(function (curMax, row, index, rows) {
    if (row.nestingLevel > curMax) {
      return row.nestingLevel
    } else {
      return curMax
    }
  }, 0);
}

var iconForItemType = function(type) {
  var className = "glyphicon glyphicon-";
  switch(type) {
    case "task":
      className += "tasks";
      break;
    case "shell-command":
        className += "console";
        break;
    case "workflow":
        className += "th";
        break;
    default:
        className += "question-sign";
  }
  return (<span className={className} aria-hidden={true}/>);
}

var WorkflowStatusOverview = React.createClass({
  getInitialState: function() {
    return {};
  },
  componentDidMount: function() {
    fetchWorkflowSkeleton(this.props.workflowId, this);
  },
  render: function() {
    var isEmpty = $.isEmptyObject(this.state);
    if(isEmpty) {
      return (<p>Loading...</p>);
    } else {

      var maxIndent = maxIndentForRows(this.state.rows);
      var tableHeader = headerForMaxIndent(maxIndent);

      var tableRows = this.state.rows.map(function(row) {
        var bootstrapStatusClass = getClassNameForWorkflowStatus(row.status);
        var labelClassName = "label label-" + bootstrapStatusClass;
        var leadingBlankCells = leadingBlankCellsForRow(row);
        var trailingBlankCells = trailingBlankCellsForRow(row, maxIndent);
        return (<tr className={bootstrapStatusClass}>
          {leadingBlankCells}
          <td>{row.name}</td>
          <td>{iconForItemType(row.type)} {row.type}</td>
          <td><span className={labelClassName}>{row.status}</span></td>
          <td>{row.timestamp}</td>
          {trailingBlankCells}
        </tr>);
      });
      return (<table className="table table-bordered">
        <tr>
          {tableHeader}
        </tr>
        <tbody>
          {tableRows}
        </tbody>
      </table>);
    }
  }
});
