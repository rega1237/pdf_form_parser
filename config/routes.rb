Rails.application.routes.draw do
  resources :system_categories
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
      post :submit_form
      post :photo_url          # Endpoint para obtener URL de foto
      delete :remove_photo     # Nuevo endpoint para eliminar foto
      get :structure           # Endpoint para obtener estructura actualizada
      post :upload_photo
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

  resources :deficiencies
  resources :interval_categories

  get 'settings', to: 'company_settings#index'

  # Health check route
  get 'up' => 'rails/health#show', as: :rails_health_check

  # PWA routes (commented out)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Root route
  root 'home#index'
end
