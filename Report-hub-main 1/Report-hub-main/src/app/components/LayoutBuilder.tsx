import React, { useState, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  Table2, 
  Activity,
  Trash2,
  GripVertical
} from 'lucide-react';

interface LayoutComponent {
  id: string;
  type: string;
  position: number;
  size: string;
}

interface LayoutBuilderProps {
  onLayoutChange: (components: LayoutComponent[]) => void;
  initialComponents?: LayoutComponent[];
  isReportFlowMode?: boolean;
}

const COMPONENT_TYPES = [
  { id: 'bar_chart', label: 'Bar chart', icon: BarChart3 },
  { id: 'line_chart', label: 'Line chart', icon: LineChart },
  { id: 'pie_chart', label: 'Pie chart', icon: PieChart },
  { id: 'kpi_tile', label: 'KPI tile', icon: Activity },
  { id: 'table', label: 'Table', icon: Table2 },
];

interface DraggableComponentProps {
  type: string;
  label: string;
  icon: React.ElementType;
}

const DraggableComponent: React.FC<DraggableComponentProps> = ({ type, label, icon: Icon }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'component',
    item: { componentType: type },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`flex items-center gap-2 px-3 py-2.5 bg-white border border-[#E5E7EB] rounded-lg cursor-move hover:border-[#111827] hover:shadow-sm transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Icon className="w-4 h-4 text-[#6B7280]" />
      <span className="text-[12px] text-[#111827] font-medium">{label}</span>
    </div>
  );
};

interface CanvasComponentProps {
  component: LayoutComponent;
  index: number;
  onRemove: (id: string) => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onResize: (id: string, size: string) => void;
}

const CanvasComponent: React.FC<CanvasComponentProps> = ({ 
  component, 
  index, 
  onRemove, 
  onMove,
  onResize 
}) => {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'canvas-component',
    item: { index },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'canvas-component',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        onMove(item.index, index);
        item.index = index;
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  // Combine drag and drop refs
  drag(drop(ref));

  const getComponentIcon = (type: string) => {
    const comp = COMPONENT_TYPES.find(c => c.id === type);
    return comp ? comp.icon : Activity;
  };

  const getComponentLabel = (type: string) => {
    const comp = COMPONENT_TYPES.find(c => c.id === type);
    return comp ? comp.label : type;
  };

  const Icon = getComponentIcon(component.type);

  return (
    <div className="relative">
      {/* Drop indicator line */}
      {isOver && (
        <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[#111827] rounded-full z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[#111827] rounded-full"></div>
        </div>
      )}
      
      <div
        ref={ref}
        className={`relative group bg-white border-2 rounded-lg p-4 transition-all ${
          isDragging ? 'opacity-50 cursor-grabbing' : 'opacity-100 cursor-grab'
        } ${
          isOver ? 'border-[#111827] shadow-md' : 'border-[#E5E7EB]'
        } ${
          component.size === 'small' ? 'h-32' :
          component.size === 'medium' ? 'h-48' :
          'h-64'
        }`}
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-[#9CA3AF] cursor-grab" />
            <Icon className="w-4 h-4 text-[#6B7280]" />
            <span className="text-[12px] text-[#111827] font-medium">
              {getComponentLabel(component.type)}
            </span>
          </div>
          <button
            onClick={() => onRemove(component.id)}
            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>

        {/* Size selector */}
        <div className="flex gap-1.5 mt-2">
          {['small', 'medium', 'large'].map((size) => (
            <button
              key={size}
              onClick={() => onResize(component.id, size)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                component.size === size
                  ? 'bg-[#111827] text-white'
                  : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Preview wireframe */}
        <div className="mt-3 flex items-center justify-center h-12 bg-gray-50 rounded border border-gray-200">
          <Icon className="w-6 h-6 text-gray-300" />
        </div>
      </div>
    </div>
  );
};

interface DropZoneProps {
  onDrop: (componentType: string) => void;
  children?: React.ReactNode;
  hasComponents: boolean;
  isReportFlowMode?: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ onDrop, children, hasComponents, isReportFlowMode = false }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'component',
    drop: (item: { componentType: string }) => {
      onDrop(item.componentType);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  return (
    <div
      ref={drop}
      className={`min-h-[400px] border-2 border-dashed rounded-lg p-4 transition-all ${
        isOver
          ? 'border-[#111827] bg-blue-50'
          : hasComponents || isReportFlowMode
          ? 'border-[#E5E7EB] bg-white'
          : 'border-[#E5E7EB] bg-gray-50'
      }`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {!hasComponents && !isOver && !isReportFlowMode && (
        <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-[13px] font-semibold text-[#111827] mb-1">
            Drop here to add visualization
          </p>
          <p className="text-[11px] text-[#9CA3AF]">
            Drag components from the left to build your layout
          </p>
        </div>
      )}
      {!hasComponents && !isOver && isReportFlowMode && (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center mb-4">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-[13px] font-semibold text-[#111827] mb-1">
            Drop here to add visualization
          </p>
          <p className="text-[11px] text-[#9CA3AF]">
            Components will be placed above the table
          </p>
        </div>
      )}
      {isOver && hasComponents && (
        <div className="mb-3 p-3 bg-blue-100 border-2 border-dashed border-blue-400 rounded-lg text-center">
          <p className="text-[12px] text-blue-700 font-medium">
            Drop to add component below
          </p>
        </div>
      )}
      {children}
      
      {/* Fixed Table - Report Flow Mode Only */}
      {isReportFlowMode && (
        <div className="mt-4">
          <div className="relative bg-white border-2 border-[#E5E7EB] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-[#6B7280]" />
                <span className="text-[12px] text-[#111827] font-medium">
                  Table (Fixed)
                </span>
              </div>
              <span className="text-[10px] text-[#9CA3AF] font-medium">
                Always visible
              </span>
            </div>

            {/* Table preview */}
            <div className="border border-gray-200 rounded overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200">
                <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]">Column 1</div>
                <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]">Column 2</div>
                <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]">Column 3</div>
                <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7280]">Column 4</div>
              </div>
              {/* Table rows */}
              {[1, 2, 3].map((row) => (
                <div key={row} className="grid grid-cols-4 border-b border-gray-100 last:border-b-0">
                  <div className="px-3 py-2 text-[10px] text-[#9CA3AF]">Data {row}</div>
                  <div className="px-3 py-2 text-[10px] text-[#9CA3AF]">Data {row}</div>
                  <div className="px-3 py-2 text-[10px] text-[#9CA3AF]">Data {row}</div>
                  <div className="px-3 py-2 text-[10px] text-[#9CA3AF]">Data {row}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const LayoutBuilder: React.FC<LayoutBuilderProps> = ({ 
  onLayoutChange,
  initialComponents = [],
  isReportFlowMode = false
}) => {
  const [components, setComponents] = useState<LayoutComponent[]>(initialComponents);

  // Filter component types based on mode
  const availableComponentTypes = isReportFlowMode 
    ? COMPONENT_TYPES.filter(comp => comp.id !== 'table')
    : COMPONENT_TYPES;

  const handleDrop = (componentType: string) => {
    const newComponent: LayoutComponent = {
      id: `comp-${Date.now()}`,
      type: componentType,
      position: components.length,
      size: 'medium',
    };
    const updatedComponents = [...components, newComponent];
    setComponents(updatedComponents);
    onLayoutChange(updatedComponents);
  };

  const handleRemove = (id: string) => {
    const updatedComponents = components
      .filter(c => c.id !== id)
      .map((c, idx) => ({ ...c, position: idx }));
    setComponents(updatedComponents);
    onLayoutChange(updatedComponents);
  };

  const handleMove = (dragIndex: number, hoverIndex: number) => {
    const dragComponent = components[dragIndex];
    const updatedComponents = [...components];
    updatedComponents.splice(dragIndex, 1);
    updatedComponents.splice(hoverIndex, 0, dragComponent);
    const reindexed = updatedComponents.map((c, idx) => ({ ...c, position: idx }));
    setComponents(reindexed);
    onLayoutChange(reindexed);
  };

  const handleResize = (id: string, size: string) => {
    const updatedComponents = components.map(c =>
      c.id === id ? { ...c, size } : c
    );
    setComponents(updatedComponents);
    onLayoutChange(updatedComponents);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex gap-6">
        {/* Component Palette */}
        <div className="w-48 flex-shrink-0">
          <div className="sticky top-4">
            <h4 className="text-[12px] font-semibold text-[#111827] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              Components
            </h4>
            <div className="space-y-2">
              {availableComponentTypes.map((comp) => (
                <DraggableComponent
                  key={comp.id}
                  type={comp.id}
                  label={comp.label}
                  icon={comp.icon}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <DropZone onDrop={handleDrop} hasComponents={components.length > 0} isReportFlowMode={isReportFlowMode}>
            <div className="grid grid-cols-1 gap-3">
              {components.map((component, index) => (
                <CanvasComponent
                  key={component.id}
                  component={component}
                  index={index}
                  onRemove={handleRemove}
                  onMove={handleMove}
                  onResize={handleResize}
                />
              ))}
            </div>
          </DropZone>
        </div>
      </div>
    </DndProvider>
  );
};