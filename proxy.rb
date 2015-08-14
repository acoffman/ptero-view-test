require 'sinatra'
require 'uri'
require 'net/http'

set :public_folder, '.'

get '/workflow/:id' do
  @id = params[:id]
  erb :index
end

get '/ptero/*' do
  domain = "http://workflow.apipe-deis.gsc.wustl.edu"
  path = params[:splat]
  uri = URI([domain, path].join('/'))
  uri.query = URI.encode_www_form({ workflow_id: params[:workflow_id] })
  res = Net::HTTP.get_response(uri)
  content_type :json
  res.body
end