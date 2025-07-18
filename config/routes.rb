Rails.application.routes.draw do
  resources :system_categories
  devise_for :users, skip: [:registrations]

  devise_scope :user do
    get 'users/edit', to: 'devise/registrations#edit', as: 'edit_user_registration'
    patch 'users', to: 'devise/registrations#update', as: 'user_registration'
    put 'users', to: 'devise/registrations#update'
    delete 'users', to: 'devise/registrations#destroy', as: 'destroy_user_registration'
  end

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
      get :download_pdf        # Nueva ruta para descargar PDF directamente
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
  resources :roles

  get 'settings', to: 'company_settings#index'

  namespace :admin do
    resources :users, only: %i[create destroy]
  end

  # Health check route
  get 'up' => 'rails/health#show', as: :rails_health_check

  # PWA routes (commented out)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Root route
  root 'home#index'
end
