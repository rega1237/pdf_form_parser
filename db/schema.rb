# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_06_03_131842) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "customers", force: :cascade do |t|
    t.string "customer_type"
    t.string "name"
    t.string "address"
    t.string "city_state_zip"
    t.string "email"
    t.string "phone_1"
    t.string "phone_2"
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "form_fills", force: :cascade do |t|
    t.string "name"
    t.bigint "form_template_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "form_structure"
    t.string "google_drive_file_id"
    t.index ["form_template_id"], name: "index_form_fills_on_form_template_id"
  end

  create_table "form_templates", force: :cascade do |t|
    t.string "name"
    t.string "original_filename"
    t.string "file_path"
    t.string "file_type"
    t.text "form_structure"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "google_drive_file_id"
  end

  create_table "inspections", force: :cascade do |t|
    t.date "date", null: false
    t.bigint "property_id", null: false
    t.bigint "form_fill_id", null: false
    t.text "notes"
    t.string "status", default: "pending"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["date"], name: "index_inspections_on_date"
    t.index ["form_fill_id"], name: "index_inspections_on_form_fill_id"
    t.index ["property_id", "date"], name: "index_inspections_on_property_id_and_date"
    t.index ["property_id"], name: "index_inspections_on_property_id"
    t.index ["status"], name: "index_inspections_on_status"
  end

  create_table "properties", force: :cascade do |t|
    t.bigint "customer_id", null: false
    t.string "property_type"
    t.string "property_name"
    t.string "address"
    t.string "city"
    t.string "zip_code"
    t.string "construction_type"
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["customer_id"], name: "index_properties_on_customer_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "form_fills", "form_templates"
  add_foreign_key "inspections", "form_fills"
  add_foreign_key "inspections", "properties"
  add_foreign_key "properties", "customers"
end
