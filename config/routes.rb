Rails.application.routes.draw do
  devise_for :users
  
  # Customers routes
  resources :customers, only: %i[index show new create edit update]
  
  # Properties routes with nested and member routes
  resources :properties do
    # Nested inspections for viewing inspections by property
    resources :inspections, only: [:index], controller: 'inspections', action: 'by_property'
    
    # Member route for creating inspection from specific property
    member do
      get :new_inspection, to: 'inspections#new'
    end
  end
  
  # Form templates routes
  resources :form_templates do
    member do
      get 'form_builder' # Route to display the form builder
      patch 'form_builder_update' # Route for updating form structure
    end
  end

  # Form fills routes
  resources :form_fills, only: %i[index new create show update destroy] do
    member do
      post 'submit_form' # Ruta para procesar y enviar el formulario PDF
      post :photo_url          # Nuevo endpoint para obtener URL de foto
      get :structure           # Nuevo endpoint para obtener estructura actualizada
      post :upload_photo       # Opcional: endpoint específico para subir fotos
    end
  end

  # Inspections routes
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
  
  # Health check route
  get 'up' => 'rails/health#show', as: :rails_health_check

  # PWA routes (commented out)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  
  # Root route
  root 'home#index'
end
