class HomeController < ApplicationController
  def index
    puts ENV['RENDER_EXTERNAL_HOSTNAME']
  end
end
