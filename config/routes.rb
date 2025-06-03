Rails.application.routes.draw do
  resources :customers, only: %i[index show new create edit update]
  resources :properties
  resources :form_templates do
    member do
      get 'form_builder' # Route to display the form builder
    end
  end

  resources :form_fills, only: %i[index new create show update destroy] do
    member do
      post 'submit_form' # Ruta para procesar y enviar el formulario PDF
    end
  end

   # Rutas principales de inspections
  resources :inspections do
    member do
      patch :update_status
    end
    
    collection do
      get :calendar
      get :dashboard
      get :properties_by_customer
    end
  end
  
  # Rutas anidadas para ver inspections por propiedad
  resources :properties do
    resources :inspections, only: [:index], controller: 'inspections', action: 'by_property'
  end
  
  # Ruta para crear inspection desde una propiedad específica
  # Ejemplo: /properties/1/new_inspection
  resources :properties do
    member do
      get :new_inspection, to: 'inspections#new'
    end
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get 'up' => 'rails/health#show', as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  #root 'inspections#dashboard'
  root 'home#index'
end
