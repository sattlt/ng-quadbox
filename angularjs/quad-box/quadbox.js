'use strict';

(function ($) {
    var panel_ghost = {
        "border": "5px solid #647887",
        "opacity": "0.8",
        "background-color": "#dfe6ed",
        "position": "absolute",
        "z-index": "999",
        "cursor": "-webkit-grabbing",
        //"cursor": "grabbing",
        "-moz-box-shadow": "5px 5px 5px rgba(0, 0, 0, 0.3)",
        "-webkit-box-shadow": "5px 5px 5px rgba(0, 0, 0, 0.3)",
        "box-shadow": "5px 5px 5px rgba(0, 0, 0, 0.3)"
    }

    function QuadBox(settings) {
        this.body = $('body');
        this.settings = settings || {
                margin: 0,
                hideCloser: false
            };
        this.boxName = '';
        this.element = null;
        this.panels = [];
        this.grid = null;
        this.dragging = false;
        this.sizing = false;
        this.sizingColIndex = -1;
        this.sizingRowIndex = -1;
        this.draggingPanel = null;
        this.draggingGhost = null;
        this.panelRemoveCallbackFns = [];
        this.panelAddCallbackFns = [];
        this.layoutCallbackFns = [];
        this.actionCallbackFns = [];
        this.position = {
            x: 0,
            y: 0
        };
        this.onExternalWindowOpenedHandler = [];
        this.onRefresh = false;

        //contains current database model
        this.dataModel = null;
        this.mouseOverPanel = null;
        this.mouseOverAncor = null;
        this.dummyPanel = null;
    }

    QuadBox.prototype.init = function (element, dataModel) {

        if (typeof element === 'string') element = $(element);

        var self = this;
        this.element = element;
        this.dataModel = dataModel;

        element.mousemove(function (evt) {
            if (!self.sizing && !self.dragging) {
                self.checkMousePosition(evt);
            }
        });

        element.mousedown(function (evt) {

            if (self.isResizeArea()) {

                evt.stopImmediatePropagation();

                self.beginSizing();
            }
        });

        var divs = this.element.children("div"),
            rowCount = Math.ceil(Math.sqrt(divs.length));

        this.panels = [];

        divs.each(function (index, div) {

            $(div).addClass("panel");

            var panel = new Panel(self, $(div).attr('data-key'), $(div).attr('data-name'));
            panel.rowIndex = Math.floor(index / rowCount);
            panel.colIndex = index % rowCount;

            panel.element = $(div);

            panel.initializeDom(self.settings.hideCloser);

            /*for (var i = 0; i < self.dataModel.boxModels.length; i++) {
             var panelModel = self.dataModel.boxModels[i];
             if (panelModel.key == $(div).attr('data-key')) {
             if (!panelModel.visible) {
             panel.element.css("display", "none");
             }
             }
             }*/

            if (panel.element.css("display") === "none") {
                panel.visible = false;
            }
            //console.log("init panel: "+$(div).attr('data-name')+", colIndex: "+panel.colIndex+", rowIndex: "+panel.rowIndex+", visible: "+panel.visible+", colSpan: "+panel.colSpan+", rowSpan: "+panel.rowSpan);

            self.panels.push(panel);
        });
        //console.log(self.panels.length+" panels loaded");

        var dummyDiv = $("<div data-name='Dummy' data-key='panelDummy' class='grey'> <div style='width: 100%; height: 100%;'></div> </div>");

        $(dummyDiv).addClass("panel");

        this.dummyPanel = new Panel(self, $(dummyDiv).attr('data-key'), $(dummyDiv).attr('data-name'));
        this.dummyPanel.rowIndex = 0;
        this.dummyPanel.colIndex = 0;

        this.dummyPanel.element = $(dummyDiv);
        this.dummyPanel.initializeDom(self.settings.hideCloser);
        this.dummyPanel.element.css("display", "none");
        this.dummyPanel.visible = false;

        this.element.append(dummyDiv);

        self.panels.push(this.dummyPanel);

        this.createGridLayout();

        this.optimizeLayout();

        this.restorePanels();
    };

    QuadBox.prototype.appendNewElement = function (key) {
        var self = this;

        var divs = this.element.children("div"),
            rowCount = Math.ceil(Math.sqrt(divs.length));

        var nextColIndex = 0;

        $.each(this.panels, function (index, panel) {
            if (panel.colIndex > nextColIndex) {
                nextColIndex = panel.colIndex;
            }
        });

        divs.each(function (index, div) {

            if ($(div).attr('data-key') === key) {

                $(div).addClass("panel");

                var panel = new Panel(self, $(div).attr('data-key'), $(div).attr('data-name'));
                panel.rowIndex = 0;
                panel.colIndex = ++nextColIndex;
                panel.rowSpan = (self.grid.vWeights.length - 1);

                panel.element = $(div);

                panel.initializeDom(self.settings.hideCloser);

                if (panel.element.css("display") === "none") {
                    panel.visible = false;
                }
                //console.log("init panel: " + $(div).attr('data-name') + ", colIndex: " + panel.colIndex + ", rowIndex: " + panel.rowIndex);

                self.panels.push(panel);
            }
        });

        //console.log(self.panels.length+" panels loaded");

        this.createGridLayout();
        this.grid.updateAbsoluteLayout();

        this.layout(true);
        this.optimizeLayout();
    };

    QuadBox.prototype.switchPanels = function (panel1, panel2) {

        var t_colIndex = panel1.colIndex;
        var t_colSpan = panel1.colSpan;
        var t_rowIndex = panel1.rowIndex;
        var t_rowSpan = panel1.rowSpan;

        panel1.colIndex = panel2.colIndex;
        panel1.colSpan = panel2.colSpan;
        panel1.rowIndex = panel2.rowIndex;
        panel1.rowSpan = panel2.rowSpan;

        panel2.colIndex = t_colIndex;
        panel2.colSpan = t_colSpan;
        panel2.rowIndex = t_rowIndex;
        panel2.rowSpan = t_rowSpan;
    }

    QuadBox.prototype.showDummy = function (sender, pos) {
        var self = this;

        var position = {
            x: pos.x - sender.element.offset().left,
            y: pos.y - sender.element.offset().top
        };
        var dimensions = {
            width: sender.element.width(),
            height: sender.element.height()
        };

        var panel = this.getPanelAt(position.x, position.y);

        if (panel != null) {

            var o = self.calculateAncor(panel, position, dimensions);
            var ancor = o.ancor;

            if (ancor != "none") {
                if (panel != self.mouseOverPanel || ancor != self.mouseOverAncor) {
                    switch (ancor) {
                        case "cornerTop":
                            if (self.dummyPanel.rowIndex > 0 || self.dummyPanel.colSpan < self.colCount()) {
                                self.shiftPanelsDown(0);
                                self.dummyPanel.colIndex = 0;
                                self.dummyPanel.colSpan = self.colCount();
                                self.dummyPanel.rowIndex = 0;
                                self.dummyPanel.rowSpan = 1;
                            }
                            break;
                        case "cornerBottom":
                            if (self.dummyPanel.rowIndex < (self.rowCount() - 1) || self.dummyPanel.colSpan < self.colCount()) {
                                self.dummyPanel.rowIndex = self.rowCount() + 1;
                                self.dummyPanel.colIndex = 0;
                                self.dummyPanel.colSpan = self.colCount();
                                self.dummyPanel.rowSpan = 1;
                            }
                            break;
                        case "cornerLeft":
                            if (self.dummyPanel.colIndex > 0 || self.dummyPanel.rowSpan < self.rowCount()) {
                                self.shiftPanelsRight(0);
                                self.dummyPanel.colIndex = 0;
                                self.dummyPanel.colSpan = 1;
                                self.dummyPanel.rowIndex = 0;
                                self.dummyPanel.rowSpan = self.rowCount();
                            }
                            break;
                        case "cornerRight":
                            if (self.dummyPanel.colIndex < (self.colCount() - 1) || self.dummyPanel.rowSpan < self.rowCount()) {
                                self.dummyPanel.rowIndex = 0;
                                self.dummyPanel.rowSpan = self.rowCount();
                                self.dummyPanel.colIndex = self.colCount();
                                self.dummyPanel.colSpan = 1;
                            }
                            break;
                    }
                    if (panel.key != "panelDummy") {
                        //console.log("mouse over " + panel.key+" Ancor "+ancor+" "+ o.x+" "+ o.y);
                        switch (ancor) {
                            case "top":
                                if (panel.rowSpan > 1) {
                                    self.dummyPanel.rowIndex = panel.rowIndex;
                                    self.dummyPanel.rowSpan = 1;
                                    self.dummyPanel.colIndex = panel.colIndex;
                                    self.dummyPanel.colSpan = panel.colSpan;
                                    panel.rowSpan -= 1;
                                    panel.rowIndex += 1;
                                } else if (panel.rowIndex > self.dummyPanel.rowIndex) {
                                    break;
                                } else {
                                    self.switchPanels(panel, self.dummyPanel);
                                }
                                break;
                            case "bottom":
                                if (panel.rowSpan > 1) {
                                    self.dummyPanel.rowIndex = panel.rowIndex + panel.rowSpan - 1;
                                    self.dummyPanel.rowSpan = 1;
                                    self.dummyPanel.colIndex = panel.colIndex;
                                    self.dummyPanel.colSpan = panel.colSpan;
                                    panel.rowSpan -= 1;
                                } else if (panel.rowIndex < self.dummyPanel.rowIndex) {
                                    break;
                                } else {
                                    self.switchPanels(panel, self.dummyPanel);
                                }
                                break;
                            case "left":
                                if (panel.colSpan > 1) {
                                    self.dummyPanel.colIndex = panel.colIndex;
                                    self.dummyPanel.colSpan = 1;
                                    self.dummyPanel.rowIndex = panel.rowIndex;
                                    self.dummyPanel.rowSpan = panel.rowSpan;
                                    panel.colIndex += 1;
                                    panel.colSpan -= 1;
                                } else if (panel.colIndex > self.dummyPanel.colIndex) {
                                    break;
                                } else {
                                    self.switchPanels(panel, self.dummyPanel);
                                }
                                break;
                            case "right":
                                if (panel.colSpan > 1) {
                                    self.dummyPanel.colIndex = panel.colIndex + panel.colSpan - 1;
                                    self.dummyPanel.colSpan = 1;
                                    self.dummyPanel.rowIndex = panel.rowIndex;
                                    self.dummyPanel.rowSpan = panel.rowSpan;
                                    panel.colSpan -= 1;
                                } else if (panel.colIndex < self.dummyPanel.colIndex) {
                                    break;
                                } else {
                                    self.switchPanels(panel, self.dummyPanel);
                                }
                                break;
                        }
                        self.dummyPanel.visible = true;
                        self.dummyPanel.element.css("display", "block");

                    }
                    self.mouseOverPanel = panel;
                    self.mouseOverAncor = ancor;

                    this.createGridLayout();
                    this.grid.updateAbsoluteLayout();

                    this.layout(true);
                    this.optimizeLayout();

                    /*
                     $.each(this.panels, function (index, panel) {
                     console.log("Panel " + panel.key + ": colIndex " + panel.colIndex + ", rowIndex " + panel.rowIndex + ", rowSpan " + panel.rowSpan+", colSpan "+panel.colSpan+", visible "+panel.visible);
                     });*/
                }
            }
        }
    }

    QuadBox.prototype.getHorizontalPanelsBefore = function (panel) {

        var neighbours = [];

        if (panel.key == "panelDummy") {
            return [];
        }

        for (var colIndex = 0; colIndex < panel.colIndex; colIndex++) {
            var neighbour = this.getPanelWith(colIndex, panel.rowIndex);
            if (neighbour !== null) {
                if (neighbours.length === 0 || neighbours[neighbours.length - 1] !== neighbour) {
                    neighbours.push(neighbour);
                }
            }
        }

        return neighbours;
    };

    QuadBox.prototype.getVerticalPanelsOver = function (panel) {

        var neighbours = [];

        for (var rowIndex = 0; rowIndex < panel.rowIndex; rowIndex++) {

            var neighbour = this.getPanelWith(panel.colIndex, rowIndex);
            if (neighbour !== null) {
                if (neighbours.length === 0 || neighbours[neighbours.length - 1] !== neighbour) {

                    neighbours.push(neighbour);
                }
            }
        }

        return neighbours;
    };

    QuadBox.prototype.calculateAncor = function (panel, position, dimensions) {
        var self = this;

        var ancor = "none";

        var verticalOffset = 0;
        var horizontalOffset = 0;
        var elementWidth = panel.element[0].offsetWidth;
        var elementHeight = panel.element[0].offsetHeight;

        var horizontalNeighbours = self.getHorizontalPanelsBefore(panel);
        var verticalNeighbours = self.getVerticalPanelsOver(panel);

        $.each(horizontalNeighbours, function (index, p) {
            horizontalOffset += p.element[0].offsetWidth;
        });

        $.each(verticalNeighbours, function (index, p) {
            verticalOffset += p.element[0].offsetHeight;
        });

        var x = position.x - horizontalOffset;
        var y = position.y - verticalOffset;

        if (x > 0 && y > 0) {

            if (position.x < 20 && (position.y > 20 && position.y < dimensions.height - 20)) {
                ancor = "cornerLeft";
            } else if (position.y < 20 && (position.x > 20 && position.x < dimensions.width - 20)) {
                ancor = "cornerTop";
            } else if (position.y > dimensions.height - 20 && (position.x > 20 && position.x < dimensions.width - 20)) {
                ancor = "cornerBottom";
            } else if (position.x > dimensions.width - 20 && (position.y > 20 && position.y < dimensions.height - 20)) {
                ancor = "cornerRight";
            } else if (x < (panel.element[0].offsetWidth * 0.4)) {
                ancor = "left";
            } else if (x > (panel.element[0].offsetWidth * 0.6)) {
                ancor = "right";
            } else if (y < (panel.element[0].offsetHeight * 0.4)) {
                ancor = "top";
            } else if (y > (panel.element[0].offsetHeight * 0.6)) {
                ancor = "bottom";
            }
        }

        var erg = {
            ancor: ancor,
            v: verticalNeighbours,
            h: horizontalNeighbours,
            x: x,
            y: y
        };

        return erg;
    }

    QuadBox.prototype.fireOnAction = function (action, start) {

        $.each(this.actionCallbackFns, function (index, callbackFn) {

            callbackFn(action, start);
        });
    }

    QuadBox.prototype.onExternalWindowOpened = function (callbackFn) {
        this.onExternalWindowOpenedHandler.push(callbackFn);
    };

    QuadBox.prototype.onPanelRemove = function (callbackFn) {
        this.panelRemoveCallbackFns.push(callbackFn);
    };

    QuadBox.prototype.onPanelAdd = function (callbackFn) {
        this.panelAddCallbackFns.push(callbackFn);
    };

    QuadBox.prototype.onLayout = function (callbackFn) {
        this.layoutCallbackFns.push(callbackFn);
    };

    QuadBox.prototype.onAction = function (callbackFn) {
        this.actionCallbackFns.push(callbackFn);
    };

    QuadBox.prototype.beginSizing = function () {

        var self = this,
            element = this.element;

        self.sizing = true;

        $(document).disableSelection();

        self.fireOnAction('sizing', true);

        function sizingMouseMove(evt) {
            evt.stopImmediatePropagation();
            self.resizeCells(evt);
        }

        function sizingMouseUp(evt) {
            $(document).enableSelection();

            self.sizing = false;
            if (self.sizingColIndex >= 0) {

                var x = evt.pageX - element.offset().left;
                self.grid.hWeights[self.sizingColIndex] = x / element.outerWidth();

            } else if (self.sizingRowIndex >= 0) {

                var y = evt.pageY - element.offset().top;
                self.grid.vWeights[self.sizingRowIndex] = y / element.outerHeight();
            }
            self.grid.updateAbsoluteLayout();
            self.layout(false);

            self.fireOnAction('sizing', false);

            element.unbind('mousemove', sizingMouseMove);
            element.unbind('mouseup', sizingMouseUp);
        }

        element.mousemove(sizingMouseMove);
        element.mouseup(sizingMouseUp);
    };

    QuadBox.prototype.resizeCells = function (evt) {

        var x, y;

        if (this.sizingColIndex >= 0) {
            //console.log("sizing cols");
            x = evt.pageX - this.element.offset().left;
            this.grid.hWidths[this.sizingColIndex] = x;

        } else if (this.sizingRowIndex >= 0) {
            //console.log("sizing rows");
            y = evt.pageY - this.element.offset().top;
            this.grid.vHeights[this.sizingRowIndex] = y;
        }

        this.layout(false);
    };

    QuadBox.prototype.checkMousePosition = function (evt) {

        var self = this,
            x = evt.pageX - this.element.offset().left,
            y = evt.pageY - this.element.offset().top;

        this.sizingColIndex = -1;
        this.sizingRowIndex = -1;

        $.each(this.grid.hWidths, function (index, width) {
            if (index > 0 && index < self.grid.hWidths.length - 1) {
                self.sizingColIndex = (width - 5 < x && x < width + 5) ? index : -1;
                return self.sizingColIndex < 0; //break if over!
            }
            return true;
        });

        if (this.sizingColIndex >= 0) {
            this.element.css("cursor", "w-resize");
        } else if (this.element.css("cursor") === "w-resize") {
            this.element.css("cursor", "auto");
        }

        if (this.sizingColIndex < 0) {
            $.each(this.grid.vHeights, function (index, height) {

                if (index > 0 && index < self.grid.vHeights.length - 1) {
                    self.sizingRowIndex = (height - 5 < y && y < height + 5) ? index : -1;
                    return self.sizingRowIndex < 0;
                }
                return true;
            });

            if (self.sizingRowIndex >= 0) {
                this.element.css("cursor", "s-resize");
            } else if (this.element.css("cursor") === "s-resize") {
                this.element.css("cursor", "auto");
            }
        }
    };

    QuadBox.prototype.isResizeArea = function () {
        return this.sizingColIndex >= 0 || this.sizingRowIndex >= 0;
    };

    QuadBox.prototype.layout = function (animate) {
        var self = this;

        $.each(this.panels, function (index, panel) {

            var panelBox = self.grid.computeBox(panel, self.settings.margin);

            if (panel.visible) {
                panel.layout(panelBox, animate);
            }
        });

        $.each(this.layoutCallbackFns, function (index, callbackFn) {
            callbackFn();
        });
    };

    QuadBox.prototype.createGridLayout = function () {

        if (!this.grid) {
            this.grid = new Grid(this.element);
        } else {
            this.grid.reset();
        }

        var hWeight = 1 / this.colCount();
        var vWeight = 1 / this.rowCount();

        for (var hIndex = 0; hIndex < this.colCount(); hIndex++) {
            this.grid.hWeights.push(hIndex * hWeight);
        }
        this.grid.hWeights.push(1);

        for (var vIndex = 0; vIndex < this.rowCount(); vIndex++) {
            this.grid.vWeights.push(vIndex * vWeight);
        }
        this.grid.vWeights.push(1);

    };

    QuadBox.prototype.rowCount = function () {

        var highestRowIndex = 0;
        $.each(this.panels, function (index, panel) {
            if (panel.visible && panel.endRowIndex() > highestRowIndex) {
                highestRowIndex = panel.endRowIndex();
            }
        });
        return highestRowIndex + 1;
    };

    QuadBox.prototype.colCount = function () {

        var highestColIndex = 0;
        $.each(this.panels, function (index, panel) {

            if (panel.visible && panel.endColIndex() > highestColIndex) {
                highestColIndex = panel.endColIndex();
            }
        });
        return highestColIndex + 1;
    };

    QuadBox.prototype.beginDragging = function (evt, panel) {
        //console.log("beginDragging: "+panel.key);

        var self = this;

        $(document).disableSelection();
        this.dragging = true;
        this.draggingPanel = panel;

        if (this.draggingGhost !== null) {
            this.draggingGhost.element.remove();
            this.draggingGhost = null;
        }
        this.draggingGhost = new Ghost(panel.name, panel.element.outerWidth() / panel.colSpan, panel.element.outerHeight() / panel.rowSpan);

        this.draggingGhost.onWindowMove(function (pos) {
            self.showDummy(self, pos);
        });

        this.element.append(this.draggingGhost.element);
        this.element.css('cursor', 'pointer');
        this.element.addClass('drag-n-drop-mode');
        this.drag(evt);

        this.dummyPanel.colIndex = this.draggingPanel.colIndex;
        this.dummyPanel.rowIndex = this.draggingPanel.rowIndex;
        this.dummyPanel.colSpan = this.draggingPanel.colSpan;
        this.dummyPanel.rowSpan = this.draggingPanel.rowSpan;
        this.dummyPanel.visible = true;
        this.dummyPanel.element.css('display', 'block');

        this.removePanel(this.draggingPanel);

        this.createGridLayout();
        this.grid.updateAbsoluteLayout();
        this.layout(false);
        this.optimizeLayout();

        this.body.mousemove(dragMouseMove);
        this.body.mouseup(dragMouseUp);

        function dragMouseMove(evt) {
            self.drag(evt);
        }

        function dragMouseUp(evt) {

            self.endDragging(evt);

            $(document).enableSelection();

            self.body.unbind('mousemove', dragMouseMove);
            self.body.unbind('mouseup', dragMouseUp);
        }
    };

    QuadBox.prototype.endDragging = function (evt) {

        $(document).enableSelection();

        this.dragging = false;
        this.element.css('cursor', 'auto');
        this.element.removeClass('drag-n-drop-mode');

        this.drop(evt);
    };

    QuadBox.prototype.showPanel = function (panel) {

        panel.colIndex = this.colCount();
        panel.colSpan = 1;
        panel.rowIndex = 0;
        panel.rowSpan = this.rowCount();
        this.grid.appendColumnAt(panel.colIndex);

        panel.element.css({
            top: -10,
            right: 200,
            weight: 10,
            height: 10
        });

        panel.visible = true;
        panel.element.css('display', 'block');
        //panel.addDnDHandler();
        this.layout(true);
        this.optimizeLayout();

        if (panel.extWindowId) {
            panel.extWindowId.close();
        }

        $.each(this.panelAddCallbackFns, function (index, callbackFn) {
            callbackFn(panel);
        });
    };

    QuadBox.prototype.drop = function (evt) {

        var self = this;

        $.each(self.panels, function (key, panel) {
            if (panel.key == "panelDummy") {
                self.movePanel(panel);
            }
        });

        this.draggingGhost.element.remove();
        this.draggingGhost = null;

        //console.log("dropped");
        $.each(this.panels, function (index, currentPanel) {
            currentPanel.dragDelayer.reset();
            //console.log("Panel: "+currentPanel.key+" colIndex "+currentPanel.colIndex+" rowIndex "+currentPanel.rowIndex+" rowSpan "+currentPanel.rowSpan+" colSpan "+currentPanel.colSpan+" visible "+currentPanel.visible);
        });

        //console.log(JSON.stringify(self.dataModel, null, 2));
    };

    QuadBox.prototype.movePanel = function (panel) {

        var self = this;

        //console.log("panel: "+panel.name+", draggingPanel: "+this.draggingPanel.name);

        this.draggingPanel.colIndex = panel.colIndex;
        this.draggingPanel.rowIndex = panel.rowIndex;
        this.draggingPanel.colSpan = panel.colSpan;
        this.draggingPanel.rowSpan = panel.rowSpan;

        panel.visible = false;
        panel.element.css("display", "none");

        this.draggingPanel.element.css({
            top: this.draggingGhost.element.css("top"),
            left: this.draggingGhost.element.css("left"),
            weight: this.draggingGhost.element.css("weight"),
            height: this.draggingGhost.element.css("height")
        });

        this.draggingPanel.visible = true;
        this.draggingPanel.element.css("display", "block");

        this.createGridLayout();
        this.grid.updateAbsoluteLayout();
        this.layout(true);
        this.optimizeLayout();

        $.each(this.panelAddCallbackFns, function (index, callbackFn) {
            callbackFn(self.draggingPanel);
        });

    };

    QuadBox.prototype.shiftPanelsRight = function (colIndex) {

        $.each(this.panels, function (index, panel) {

            if (panel.visible && panel.colIndex >= colIndex) {

                panel.colIndex += 1;
            }
        });
    };

    QuadBox.prototype.shiftPanelsDown = function (rowIndex) {

        $.each(this.panels, function (index, panel) {

            if (panel.visible && panel.rowIndex >= rowIndex) {

                panel.rowIndex += 1;
            }
        });
    };

    QuadBox.prototype.dispose = function () {

        this.element.unbind('mousemove');
        this.element.unbind('mousedown');
        this.settings = null;
        this.boxName = '';
        this.element = null;
        this.panels = null;
        this.grid = null;
        this.dragging = false;
        this.sizing = false;
        this.sizingColIndex = -1;
        this.sizingRowIndex = -1;
        this.draggingPanel = null;
        this.draggingGhost = null;
        this.panelRemoveCallbackFns = null;
        this.panelAddCallbackFns = null;
        this.layoutCallbackFns = null;

    };

// returns panel if it is in the dom otherwise false
    QuadBox.prototype.containsPanel = function (panelKey) {
        var self = this;

        var panel = null;

        $.each(self.panels, function (index, element) {
            if (element.key == panelKey) {
                if (element.element !== null) {
                    panel = element;
                }
            }
        });

        if (panel == null) {
            return false;
        } else {
            return panel;
        }
    }

    QuadBox.prototype.removePanel = function (panel) {

        if (this.visiblePanelsCount() > 1) {

            panel.visible = false;

            if (panel.element !== null) {
                panel.element.css('display', 'none');
            }

            this.layout(false);
            this.optimizeLayout();

            if (panel.key != 'panelDummy') {

                $.each(this.panelRemoveCallbackFns, function (index, callbackFn) {
                    callbackFn(panel);
                });
            }
            //console.log("remove panel");
        }

        return !panel.visible;
    };

    QuadBox.prototype.visiblePanelsCount = function () {

        var count = 0;

        $.each(this.panels, function (index, panel) {
            if (panel.visible) {
                count++;
            }
        });

        return count;
    };

    QuadBox.prototype.optimizeLayout = function () {

        var self = this,
            panel, neighbours, colIndex, rowIndex, spanned;

        //Try to fill empty cells
        for (colIndex = this.grid.hWeights.length - 2; colIndex >= 0; colIndex--) {
            for (rowIndex = 0; rowIndex <= this.grid.vWeights.length - 2; rowIndex++) {

                panel = self.getPanelWith(colIndex, rowIndex);
                if (panel !== null) {

                    var stop = false;
                    while (!stop && panel.colIndex > 0) {

                        neighbours = this.getHorizontalNeighboursOf(panel, true);
                        if (neighbours.length === 0) {

                            panel.colIndex -= 1;
                            panel.colSpan += 1;

                        } else {
                            stop = true;
                        }
                    }
                    stop = false;
                    while (!stop && panel.colIndex + panel.colSpan < this.grid.hWeights.length - 1) {

                        neighbours = this.getHorizontalNeighboursOf(panel, false);
                        if (neighbours.length === 0) {
                            panel.colSpan += 1;
                        } else {
                            stop = true;
                        }
                    }
                    stop = false;
                    while (!stop && panel.rowIndex > 0) {
                        neighbours = this.getVerticalNeighboursOf(panel, true);
                        if (neighbours.length === 0) {
                            panel.rowIndex -= 1;
                            panel.rowSpan += 1;
                        } else {
                            stop = true;
                        }
                    }
                    stop = false;
                    while (!stop && panel.rowIndex + panel.rowSpan < this.grid.vWeights.length - 1) {

                        neighbours = this.getVerticalNeighboursOf(panel, false);
                        if (neighbours.length === 0) {
                            panel.rowSpan += 1;
                        } else {
                            stop = true;
                        }
                    }
                }
            }
        }

        //Remove spanned columns
        var spannedColSegments = [];
        for (colIndex = this.grid.hWeights.length - 2; colIndex > 0; colIndex--) {

            spanned = true;
            for (rowIndex = 0; spanned && rowIndex <= this.grid.vWeights.length - 2; rowIndex++) {

                panel = this.getPanelWith(colIndex, rowIndex);
                if (panel !== null && panel.colIndex === colIndex) {
                    spanned = false;
                }
            }
            if (spanned) {
                spannedColSegments.push(colIndex);
            }
        }

        $.each(spannedColSegments, function (index, colIndex) {

            self.grid.mergeColumns(colIndex);

            $.each(self.panels, function (index, panel) {
                if (panel.visible) {

                    if (panel.colIndex < colIndex && panel.colIndex + panel.colSpan > colIndex) {

                        panel.colSpan -= 1;

                    } else if (panel.colIndex >= colIndex) {

                        panel.colIndex -= 1;
                    }

                }
            });
        });

        //Remove spanned rows
        var spannedRowSegments = [];
        for (rowIndex = this.grid.vWeights.length - 2; rowIndex > 0; rowIndex--) {

            spanned = true;
            for (colIndex = 0; spanned && colIndex <= this.grid.hWeights.length - 2; colIndex++) {

                panel = this.getPanelWith(colIndex, rowIndex);
                if (panel !== null && panel.rowIndex === rowIndex) {
                    spanned = false;
                }
            }
            if (spanned) {
                spannedRowSegments.push(rowIndex);
            }
        }

        $.each(spannedRowSegments, function (index, rowIndex) {

            self.grid.mergeRows(rowIndex);

            $.each(self.panels, function (index, panel) {
                if (panel.visible) {

                    if (panel.rowIndex < rowIndex && panel.rowIndex + panel.rowSpan > rowIndex) {

                        panel.rowSpan -= 1;

                    } else if (panel.rowIndex >= rowIndex) {

                        panel.rowIndex -= 1;
                    }
                }
            });
        });
    };

    QuadBox.prototype.getHorizontalNeighboursOf = function (panel, left) {

        var neighbours = [];

        for (var rowIndex = panel.rowIndex; rowIndex < panel.rowIndex + panel.rowSpan; rowIndex++) {

            var neighbour = this.getPanelWith(panel.colIndex + (left ? -1 : panel.colSpan), rowIndex);
            if (neighbour !== null) {
                if (neighbours.length === 0 || neighbours[neighbours.length - 1] !== neighbour) {

                    neighbours.push(neighbour);
                }
            }
        }

        return neighbours;
    };

    QuadBox.prototype.getVerticalNeighboursOf = function (panel, top) {

        var neighbours = [];

        for (var colIndex = panel.colIndex; colIndex < panel.colIndex + panel.colSpan; colIndex++) {

            var neighbour = this.getPanelWith(colIndex, panel.rowIndex + (top ? -1 : panel.rowSpan));
            if (neighbour !== null) {
                if (neighbours.length === 0 || neighbours[neighbours.length - 1] !== neighbour) {

                    neighbours.push(neighbour);
                }
            }
        }

        return neighbours;
    };

    QuadBox.prototype.getPanelWith = function (colIndex, rowIndex) {

        var foundPanel = null;
        $.each(this.panels, function (index, panel) {

            if (panel.visible) {

                if (panel.allocatesCell(colIndex, rowIndex)) {
                    foundPanel = panel;
                    return false; //Interrupt loop
                }
            }
        });
        return foundPanel;
    };

    QuadBox.prototype.getPanelByKey = function (key) {

        var result = null;

        $.each(this.panels, function (i, panel) {

            if (panel.key === key) {
                result = panel;
                return false;
            }

            return true;
        });

        return result;
    };

    QuadBox.prototype.getPanelAt = function (dropX, dropY) {

        var foundPanel = null;
        for (var panelIndex = 0; foundPanel === null && panelIndex < this.panels.length; panelIndex++) {

            var panel = this.panels[panelIndex];

            if (panel.visible) {
                var x = panel.element.position().left;
                var y = panel.element.position().top;
                var w = panel.element.outerWidth();
                var h = panel.element.outerHeight();

                if (x < dropX && dropX < x + w) {

                    if (y < dropY && dropY < y + h) {

                        foundPanel = panel;
                    }
                }
            }
        }
        return foundPanel;
    };

    QuadBox.prototype.drag = function (evt) {
        var x = evt.pageX - this.element.offset().left - this.draggingGhost.element.outerWidth() / 2;
        var y = evt.pageY - this.element.offset().top - 20;

        this.draggingGhost.element.css({
            left: x,
            top: y
        });
    };

    QuadBox.prototype.serializePanels = function () {

        this.onRefresh = false;

        var serialize = {};

        serialize.boxModels = [];
        serialize.boxName = this.boxName;

        $.each(this.panels, function (index, currentPanel) {
            if (currentPanel.visible || currentPanel.key == "panelDummy") {
                serialize.boxModels.push(currentPanel.serializePosition());
            }
        });

        serialize.grid = this.grid.serialize();

        return serialize;
    };

    QuadBox.prototype.restorePanels = function () {

        this.onRefresh = true;
        var self = this;

        $.each(self.dataModel.boxModels, function (index, currentSetting) {

            var panel = self.getPanelByKey(currentSetting.key);
            if (panel !== null) {
                if (!currentSetting.visible) {
                    self.removePanel(panel);
                } else {
                    panel.restorePosition(currentSetting);
                }
            }
        });

        this.createGridLayout();

        if (self.dataModel.grid) {

            if (self.dataModel.grid.hWeights) {
                this.grid.hWeights = self.dataModel.grid.hWeights;
            }

            if (self.dataModel.grid.hWidths) {
                this.grid.hWidths = self.dataModel.grid.hWidths;
            }

            if (self.dataModel.grid.vWeights) {
                this.grid.vWeights = self.dataModel.grid.vWeights;
            }

            if (self.dataModel.grid.vWidths) {
                this.grid.vWidths = self.dataModel.grid.vWidths;
            }
        }

        this.grid.updateAbsoluteLayout(this.element);
        this.layout(false);

        this.onRefresh = false;

    };

    function Panel(quadBox, key, name) { // jshint ignore:line

        this.quadBox = quadBox;
        this.key = key;
        this.name = name;
        this.rowIndex = 0;
        this.colIndex = 0;
        this.rowSpan = 1;
        this.colSpan = 1;
        this.element = null;
        this.content = null;
        this.visible = true;
        this.isDomInitialized = false;
    }

    Panel.prototype.dragDelayer = {
        active: false,
        pos: {
            x: 0,
            y: 0
        },
        delayOffset: 10,
        reset: function () {
            this.pos = {
                x: 0,
                y: 0
            };
            this.active = false;
        }
    };

    Panel.prototype.endRowIndex = function () {
        return this.rowIndex + this.rowSpan - 1;
    };

    Panel.prototype.endColIndex = function () {
        return this.colIndex + this.colSpan - 1;
    };

    Panel.prototype.layout = function (box, animate) {

        var dndHandle = this.element.find(".panel-dnd-handle");

        var handleCss = {
            left: 0,
            width: '100%',
            height: 19
        };

        dndHandle.css(handleCss);


        var panelCss = {
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height
        };

        var contentCss = {
            left: 0,
            top: 0,
            width: box.width,
            height: box.height
        };

        if (animate) {
            this.element.animate(panelCss, 200);
            this.content.animate(contentCss, 200);

        } else {
            this.element.css(panelCss);
            this.content.css(contentCss);
        }
    };

    Panel.prototype.initializeDom = function (hideCloser) {

        var self = this;

        // Ignore if we already initialized the DOM
        if (this.isDomInitialized) {
            return;
        }

        this.element.css({
            position: 'absolute'
        });
        this.content = this.element.children("div");

        // Content may not be loaded yet
        if (!this.content.length) {
            return;
        }

        this.content.css({
            position: 'absolute'
        });


        var toolbar = this.content.find('.panel-header-toolbar');
        if (!toolbar.length) {
            toolbar = $('<div></div>');
            toolbar.addClass('panel-header-toolbar');
            this.content.append(toolbar);
        }

        if (!self.element[0].attributes['disable-externalwindow']) {
            var expandNewWindow = this.content.find('.panel-header-toolbar-button-external-window');
            if (expandNewWindow.length === 0) {
                expandNewWindow = $('<div></div>');
                expandNewWindow.addClass('panel-header-toolbar-button');
                expandNewWindow.addClass('panel-header-toolbar-button-external-window');
                expandNewWindow.attr('title', this.quadBox.localize('Open as external window'));
                expandNewWindow.click(function () {
                    self.remove();
                    self.extWindowId = window.open('./index.html#/extwindow/' + self.key, self.name, 'menubar=false');
                    self.extWindowId.addEventListener('load', function () {
                        $.each(self.quadBox.onExternalWindowOpenedHandler, function (index, callbackFn) {
                            callbackFn(self);
                        });
                    });
                });

                toolbar.prepend(expandNewWindow);
            }
        }

        var closer = this.content.find(".panel-header-toolbar-button-closer");
        if (closer.length === 0) {
            if (!hideCloser) {
                closer = $('<div></div>');
                closer.addClass("panel-header-toolbar-button");
                closer.addClass("panel-header-toolbar-button-closer");
                closer.attr('title', this.quadBox.localize('Close'));
                closer.click(function () {
                    self.remove();
                });
                this.content.find('.panel-header-toolbar').prepend(closer);
            }
        } else {
            if (hideCloser) {
                closer.remove();
            }
        }

        // fix eventbubbling
        this.content.find('.panel-header-toolbar .panel-header-toolbar-button').each(function (index, item) {
            $(item)
                .on('mouseenter', function (evt) {
                    evt.stopPropagation();
                    evt.bubbles = false;
                    return false;
                })
                .on('mousedown', function (evt) {
                    evt.stopPropagation();
                    evt.bubbles = false;
                    return false;
                })
                .on('mouseup', function (evt) {
                    evt.stopPropagation();
                    evt.bubbles = false;
                    return false;
                })
                .on('mouseleave', function (evt) {
                    evt.stopPropagation();
                    evt.bubbles = false;
                    return false;
                });
        });

        // Add drag/drop handle
        var dndHandle = this.element.find(".panel-header .panel-dnd-handle");
        if (dndHandle.length === 0) {

            var grabber = $('<div></div>');
            grabber.addClass('panel-dnd-grabber');

            this.element.find('.panel-header')
                .addClass('panel-dnd-handle')
                .append(grabber);

            this.addDnDHandler();
        }

        this.isDomInitialized = true;
    };

    Panel.prototype.addDnDHandler = function () {

        var self = this;

        var dndHandle = this.element.find(".panel-dnd-handle");

        dndHandle.mouseenter(function (evt) {

            evt.stopImmediatePropagation();
            if (!self.quadBox.dragging) {
                self.quadBox.element.css('cursor', 'pointer');
            }
        });

        dndHandle.mousedown(function (evt) {
            //evt.stopImmediatePropagation();

            if (self.quadBox.dragging || self.quadBox.isResizeArea()) return;

            if (evt.button === 0) {
                dndHandle
                    .css('cursor', '-webkit-grabbing')
                    .css('cursor', 'grabbing');

                if (!self.dragDelayer.active) {

                    self.dragDelayer.active = true;
                    self.dragDelayer.pos = {
                        x: evt.clientX,
                        y: evt.clientY
                    };

                    var mousemove = function (evt) {

                        if (self.quadBox.dragging) return;

                        if (self.dragDelayer.active) {
                            if ((evt.button === 0) &&
                                (!(evt.clientY < (self.dragDelayer.pos.y + self.dragDelayer.delayOffset) && evt.clientY > (self.dragDelayer.pos.y - self.dragDelayer.delayOffset)) || !(evt.clientX < (self.dragDelayer.pos.x + self.dragDelayer.delayOffset) && evt.clientX > (self.dragDelayer.pos.x - self.dragDelayer.delayOffset)))) {

                                self.quadBox.beginDragging(evt, self);
                                self.dragDelayer.reset();
                            }
                        }
                    };

                    var mouseup = function (evt) {

                        dndHandle
                            .css('cursor', '-webkit-grab')
                            .css('cursor', 'grab');

                        self.dragDelayer.reset();

                        self.quadBox.body.unbind('mousemove', mousemove);
                        self.quadBox.body.unbind('mouseup', mouseup);
                    };

                    self.quadBox.body.mousemove(mousemove);
                    self.quadBox.body.mouseup(mouseup);
                }
            }
        });

        dndHandle.mouseleave(function (evt) {
            evt.stopImmediatePropagation();
            if (!self.quadBox.dragging) {
                self.quadBox.element.css('cursor', 'auto');
            }

            $(evt.currentTarget)
                .css('cursor', '-webkit-grab')
                .css('cursor', 'grab');

        });


    };

    Panel.prototype.remove = function () {
        //this.quadBox.setVisibilityForPanel(this, this.key);
        this.quadBox.removePanel(this);
        this.quadBox.createGridLayout();
        this.quadBox.grid.updateAbsoluteLayout();
        this.quadBox.layout(false);
        this.quadBox.optimizeLayout();
    };

    Panel.prototype.allocatesCell = function (colIndex, rowIndex) {

        var allocates = false;

        if (this.colIndex <= colIndex && this.rowIndex <= rowIndex) {

            if (this.colIndex + this.colSpan > colIndex && this.rowIndex + this.rowSpan > rowIndex) {
                allocates = true;
            }
        }

        return allocates;
    };

    Panel.prototype.isInBox = function (mousePos) {

        var isInBox = false;
        var box = {
            x1: this.element.offset().left,
            y1: this.element.offset().top,
            x2: this.element.offset().left + this.element[0].offsetWidth,
            y2: this.element.offset().top + this.element[0].offsetHeight,
            width: this.element[0].offsetWidth,
            height: this.element[0].offsetHeight
        };

        if (mousePos.x > box.x1 && mousePos.x < box.x2) {
            if (mousePos.y > box.y1 && mousePos.y < box.y2) {
                isInBox = true;
            }
        }

        return isInBox;
    };

    Panel.prototype.serializePosition = function () {

        return {
            key: this.key,
            colIndex: this.colIndex,
            colSpan: this.colSpan,
            rowIndex: this.rowIndex,
            rowSpan: this.rowSpan,
            visible: this.visible,
            percentalWidth: (this.element.width() / this.quadBox.element.width() + 0.005) * 100,
            percentalHeight: (this.element.height() / this.quadBox.element.height() + 0.005) * 100
        };
    };

    Panel.prototype.restorePosition = function (setting) {

        if (this.key === setting.key) {
            this.colIndex = setting.colIndex;
            this.colSpan = setting.colSpan;
            this.rowIndex = setting.rowIndex;
            this.rowSpan = setting.rowSpan;
            this.visible = setting.visible;

            this.element.width(this.quadBox.element.width() * (setting.percentalWidth / 100));
            this.element.height(this.quadBox.element.height() * (setting.percentalHeight / 100));
        }
    };

    function Grid(container) { // jshint ignore:line
        this.reset();
        this.container = container;
    }

    Grid.prototype.reset = function () {

        this.vWeights = [];
        this.hWeights = [];
        this.hWidths = [];
        this.vHeights = [];
    };

    Grid.prototype.updateAbsoluteLayout = function () {
        var cWidth = this.container.outerWidth();
        var cHeight = this.container.outerHeight();

        this.hWidths = [];
        for (var hIndex = 0; hIndex < this.hWeights.length; hIndex++) {

            this.hWidths.push(cWidth * this.hWeights[hIndex]);
        }

        this.vHeights = [];
        for (var vIndex = 0; vIndex < this.vWeights.length; vIndex++) {

            this.vHeights.push(cHeight * this.vWeights[vIndex]);
        }

    };

    Grid.prototype.computeBox = function (panel, margin) {

        var x = this.hWidths[panel.colIndex];
        var y = this.vHeights[panel.rowIndex];
        var width = this.hWidths[panel.colIndex + panel.colSpan] - x;
        var height = this.vHeights[panel.rowIndex + panel.rowSpan] - y;

        var halfMargin = margin / 2;
        var leftMargin = panel.colIndex > 0 ? halfMargin : 0;
        var rightMargin = panel.colIndex + panel.colSpan < this.hWidths.length - 1 ? halfMargin : 0;
        var topMargin = panel.rowIndex > 0 ? halfMargin : 0;
        var bottomMargin = panel.rowIndex + panel.rowSpan < this.vHeights.length - 1 ? halfMargin : 0;

        return {
            x: x + leftMargin,
            y: y + topMargin,
            width: width - leftMargin - rightMargin,
            height: height - topMargin - bottomMargin
        };

    };

    Grid.prototype.appendColumnAt = function (columnIndex) {

        var newColWeight = 1 / this.hWeights.length,
            restWeights = 1 - newColWeight,
            newHWeights = [],
            totalHWeight = 0,
            weight;

        for (var colIndex = 0; colIndex < this.hWeights.length; colIndex++) {

            if (colIndex > 0) {

                weight = (this.hWeights[colIndex] - this.hWeights[colIndex - 1]) * restWeights;
                totalHWeight += weight;
            }

            newHWeights.push(totalHWeight);

            if (colIndex === columnIndex) {

                totalHWeight += newColWeight;
                newHWeights.push(totalHWeight);
            }

        }
        this.hWeights = newHWeights;

        this.updateAbsoluteLayout();
    };

    Grid.prototype.appendRowAt = function (rowIndex) {

        var newRowWeight = 1 / this.vWeights.length,
            factor = 1 - newRowWeight,
            newVWeights = [],
            totalVWeight = 0,
            weight;

        for (var rowIdx = 0; rowIdx < this.vWeights.length; rowIdx++) {

            if (rowIdx > 0) {

                weight = (this.vWeights[rowIdx] - this.vWeights[rowIdx - 1]) * factor;
                totalVWeight += weight;
            }

            newVWeights.push(totalVWeight);

            if (rowIdx === rowIndex) {

                totalVWeight += newRowWeight;
                newVWeights.push(totalVWeight);
            }

        }
        this.vWeights = newVWeights;

        this.updateAbsoluteLayout();
    };

    Grid.prototype.mergeColumns = function (colIndex) {

        var mergedColWeight = this.hWeights[colIndex + 1] - this.hWeights[colIndex - 1],
            weights = [0];

        for (var colIdx = 1; colIdx < this.hWeights.length; colIdx++) {

            if (colIdx === colIndex) {
                weights.push(weights[weights.length - 1] + mergedColWeight);
                colIdx++; //Skip next index
            } else {
                weights.push(this.hWeights[colIdx]);
            }
        }
        this.hWeights = weights;

        this.updateAbsoluteLayout();
    };

    Grid.prototype.splitColumn = function (colIndex) {

        var splittedColWeight = (this.hWeights[colIndex + 1] - this.hWeights[colIndex]) / 2,
            weights = [];

        for (var colIdx = 0; colIdx < this.hWeights.length; colIdx++) {

            weights.push(this.hWeights[colIdx]);
            if (colIdx === colIndex) {

                weights.push(weights[weights.length - 1] + splittedColWeight);
            }
        }

        this.hWeights = weights;
        this.updateAbsoluteLayout();
    };

    Grid.prototype.mergeRows = function (rowIndex) {

        var mergedRowWeight = this.vWeights[rowIndex + 1] - this.vWeights[rowIndex - 1],
            weights = [0];

        for (var rowIdx = 1; rowIdx < this.vWeights.length; rowIdx++) {

            if (rowIdx === rowIndex) {
                weights.push(weights[weights.length - 1] + mergedRowWeight);
                rowIdx++; //Skip next index
            } else {
                weights.push(this.vWeights[rowIdx]);
            }
        }
        this.vWeights = weights;

        this.updateAbsoluteLayout();
    };

    Grid.prototype.splitRow = function (rowIndex) {

        var splittedRowWeight = (this.vWeights[rowIndex + 1] - this.vWeights[rowIndex]) / 2,
            weights = [];

        for (var rowIdx = 0; rowIdx < this.vWeights.length; rowIdx++) {

            weights.push(this.vWeights[rowIdx]);
            if (rowIdx === rowIndex) {

                weights.push(weights[weights.length - 1] + splittedRowWeight);
            }
        }

        this.vWeights = weights;
        this.updateAbsoluteLayout();
    };

    Grid.prototype.serialize = function () {

        // Create an temp object
        var tmp = {
            hWeights: this.hWeights,
            hWidths: this.hWidths,
            vHeights: this.vHeights,
            vWeights: this.vWeights
        };

        return tmp;
    };

    function Ghost(title, width, height) { // jshint ignore:line

        this.title = title;
        this.width = width;
        this.height = height;
        this.moveCallbackFns = [];

        this.element = this.createGhost();

        this.element.css({
            position: 'absolute',
            width: this.width,
            height: this.height
        });
    }

    Ghost.prototype.onWindowMove = function (callbackFn) {
        this.moveCallbackFns.push(callbackFn);
    };

    Ghost.prototype.createGhost = function () {

        var self = this;
        var ghost = $("<div></div>");
        ghost.css(panel_ghost);

        ghost.on('mousemove', function (evt) {
            $.each(self.moveCallbackFns, function (index, callbackFn) {

                var pos = {
                    x: evt.pageX,
                    y: evt.pageY
                };

                callbackFn(pos);
            });
        });

        var ghostHead = $("<div></div>");
        ghostHead.addClass("panel-ghost-head");

        var ghostTitle = $("<span></span>");
        ghostTitle.addClass("panel-ghost-title");
        ghostTitle.append(this.title);

        ghostHead.append(ghostTitle);
        ghost.append(ghostHead);

        return ghost;
    };

    $.fn.quadbox = function (options) {
        var instance = new QuadBox(options);
        return instance;
    };

}(jQuery));
