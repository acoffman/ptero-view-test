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
  });

  var processedRows = processTasks(skeleton.tasks, indexedExecutions, 0, rows);
  callingContext.setState({rows: processedRows});
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


var processTasks = function(tasks, indexedExecutions, nestingLevel, rows) {
  var sortedTaskKeys = getSortedTaskKeys(tasks);
  sortedTaskKeys.forEach(function (taskKey, index, array) {
    $.merge(rows, getStatusInfoRowsForTask(taskKey, tasks[taskKey], indexedExecutions.tasks, nestingLevel));
    processMethods(tasks[taskKey], indexedExecutions, nestingLevel + 1, rows);
  });
  return rows;
}

var getSortedTaskKeys = function(tasks) {
    return Object.keys(tasks).sort(function(a, b) {
      return tasks[a].topologicalIndex - tasks[b].topologicalIndex;
    });
}

var getStatusInfoRowsForTask = function(name, task, tasksById, nestingLevel) {
  var executions = tasksById[task.id];
  return executions.map(function (execution) {
    return {
      name: name,
      status: execution.status,
      timestamp: getTimestampForStatusAndHistory(execution.status, execution.statusHistory),
      nestingLevel: nestingLevel,
      type: 'task'
    };
  });
}

var processMethods = function(task, indexedExecutions, nestingLevel, rows) {
  task.methods.forEach(function(method, index, methods) {
    $.merge(rows, getStatusInfoRowsForMethod(method, indexedExecutions.methods, nestingLevel));
    if (method.service == "workflow") {
      processTasks(method.parameters.tasks, indexedExecutions, nestingLevel + 1, rows);
    }
  });
}

var getStatusInfoRowsForMethod = function(method, methodsById, nestingLevel) {
  var executions = methodsById[method.id];
  return executions.map(function (execution) {
    return {
      name: method.name,
      status: execution.status,
      timestamp: getTimestampForStatusAndHistory(execution.status, execution.statusHistory),
      nestingLevel: nestingLevel,
      type: method.service,
    };
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
  var i= nestingLevel;
  var accum = [];
  while (i > 0) {
    accum.push(<span className="glyphicon glyphicon-arrow-right" aria-hidden={true}/>);
    i--;
  }
  return accum;
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
      var tableRows = this.state.rows.map(function(row) {
        var className = "label label-" + getClassNameForWorkflowStatus(row.status);
        return (<tr>
          <td>{iconForItemType(row.type)} {row.type}</td>
          <td><span className={className}>{row.status}</span></td>
          <td>{row.timestamp}</td>
          <td>{spacersForNestingLevel(row.nestingLevel)} {row.name}</td>
        </tr>);
      });
      return (<table className="table table-bordered table-striped">
        <tr>
          <th>
            Type
          </th>
          <th>
            Status
          </th>
          <th>
            Timestamp
          </th>
          <th>
            Name
          </th>
        </tr>
        <tbody>
          {tableRows}
        </tbody>
      </table>);
    }
  }
});
