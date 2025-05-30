Rails.application.routes.draw do
  # get "form_templates/index"
  # get "form_templates/new"
  # get "form_templates/create"
  # get "form_templates/show"
  # get "form_templates/destroy"
  resources :form_templates do
    member do
      get 'fill' # Route to display the form for filling
      post 'submit_filled_form' # Route to handle submission of the filled form
      get 'form_builder' # Route to display the form builder
    end
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get 'up' => 'rails/health#show', as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end
