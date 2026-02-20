class CreateCustomerEmails < ActiveRecord::Migration[8.0]
  def change
    create_table :customer_emails do |t|
      t.string :address, null: false
      t.boolean :primary, default: false, null: false
      t.references :customer, null: false, foreign_key: true

      t.timestamps
    end

    reversible do |dir|
      dir.up do
        execute <<-SQL
          INSERT INTO customer_emails (address, "primary", customer_id, created_at, updated_at)
          SELECT email, true, id, NOW(), NOW()
          FROM customers
          WHERE email IS NOT NULL AND email != ''
        SQL
      end

      dir.down do
        execute <<-SQL
          UPDATE customers
          SET email = (
            SELECT address FROM customer_emails
            WHERE customer_emails.customer_id = customers.id
            AND customer_emails."primary" = true
            LIMIT 1
          )
        SQL
      end
    end
  end
end
