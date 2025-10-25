Rails.application.routes.draw do
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
      post :send_email         # Route for sending email with PDF attachment
      post :photo_url          # Endpoint para obtener URL de foto
      delete :remove_photo     # Nuevo endpoint para eliminar foto
      get :structure           # Endpoint para obtener estructura actualizada
      post :upload_photo
      # New data-focused endpoints
      patch :update_field_data # AJAX endpoint for single field updates
      patch :bulk_update_data  # AJAX endpoint for multiple field updates
      get :get_merged_form_data # Endpoint for PDF generation data retrieval
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

  resources :next_inspections, only: %i[index show destroy] do
    collection do
      get :calendar # Ruta para la vista calendario
      post :handle_duplicate # Ruta para manejar duplicados
      post :create_after_duplicate_resolution # Ruta para crear después de resolver duplicado
    end

    member do
      # Esta ruta nos permitirá crear una inspección a partir de una 'NextInspection'
      post :create_inspection_from_next
    end
  end

  resources :deficiencies
  resources :interval_categories
  resources :system_categories
  resources :roles
  resources :contractor_infos, only: [:new, :create, :edit, :update, :destroy]
  resources :license_infos, only: [:new, :create, :edit, :update, :destroy]

  get 'settings', to: 'company_settings#index'

  namespace :admin do
    resources :users, only: %i[create destroy]
  end

  # Health check route
  get 'up' => 'rails/health#show', as: :rails_health_check

  # API routes for offline functionality
  namespace :api do
    namespace :v1 do
      resources :inspections, only: [] do
        member do
          get :offline_data # Endpoint para obtener datos completos de inspección para offline
        end
      end

      post 'sync', to: 'sync#sync_data' # Endpoint para sincronización de datos offline
      post 'sync/upload_photo', to: 'sync#upload_photo' # Endpoint para subir fotos desde offline
      get 'sync/status', to: 'sync#sync_status' # Endpoint para verificar estado de sincronización
    end
  end

  # PWA routes - Service Worker debe estar en la raíz para scope '/'
  get 'manifest.json', to: 'pwa#manifest', as: 'pwa_manifest'
  get 'service-worker.js', to: 'pwa#service_worker', as: 'pwa_service_worker'

  # Root route
  root 'home#index'
end
