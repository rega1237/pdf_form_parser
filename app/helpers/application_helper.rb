# app/helpers/application_helper.rb
module ApplicationHelper
  def status_glassmorphism_class(status)
    case status.to_s.downcase
    when 'completed'
      'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    when 'in_progress'
      'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    when 'pending'
      'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    when 'cancelled'
      'bg-red-500/20 text-red-300 border border-red-500/30'
    when 'scheduled'
      'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    when 'overdue'
      'bg-orange-500/20 text-orange-300 border border-orange-500/30'
    else
      'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    end
  end

  # Helper adicional para iconos de estado
  def status_icon_svg(status)
    case status.to_s.downcase
    when 'completed'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      end
    when 'in_progress'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      end
    when 'pending'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      end
    when 'cancelled'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M6 18L18 6M6 6l12 12"
      end
    when 'scheduled'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      end
    when 'overdue'
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      end
    else
      content_tag :svg, class: "w-4 h-4 mr-1.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" do
        content_tag :path, nil, 'stroke-linecap': "round", 'stroke-linejoin': "round", 'stroke-width': "2", d: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      end
    end
  end

  # Helper para usar en badges con iconos
  def status_badge_with_icon(status, size: 'default')
    css_classes = status_glassmorphism_class(status)
    
    # Tamaños disponibles
    size_classes = case size
    when 'small'
      'px-2 py-1 text-xs'
    when 'large'  
      'px-4 py-2 text-sm'
    else
      'px-3 py-1 text-xs'
    end
    
    content_tag :span, class: "inline-flex items-center #{size_classes} font-semibold rounded-full #{css_classes}" do
      concat(status_icon_svg(status))
      concat(status.to_s.humanize)
    end
  end

  # Helper para colores de fondo de estado (útil para otros elementos)
  def status_bg_color(status)
    case status.to_s.downcase
    when 'completed'
      'from-emerald-500 to-emerald-700'
    when 'in_progress'
      'from-amber-500 to-orange-600'
    when 'pending'
      'from-slate-500 to-slate-700'
    when 'cancelled'
      'from-red-500 to-red-700'
    when 'scheduled'
      'from-blue-500 to-blue-700'
    when 'overdue'
      'from-orange-500 to-red-600'
    else
      'from-slate-500 to-slate-700'
    end
  end

  # Helper para obtener el color del texto del estado
  def status_text_color(status)
    case status.to_s.downcase
    when 'completed'
      'text-emerald-300'
    when 'in_progress'
      'text-amber-300'
    when 'pending'
      'text-slate-300'
    when 'cancelled'
      'text-red-300'
    when 'scheduled'
      'text-blue-300'
    when 'overdue'
      'text-orange-300'
    else
      'text-slate-300'
    end
  end
end
