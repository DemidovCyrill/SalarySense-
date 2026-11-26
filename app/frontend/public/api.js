const base = '/api/v1';

async function request(path, method = 'GET', data, prefix = base) {
  let response;
  try {
    response = await fetch(prefix + path, {
      method, credentials:'same-origin', headers:data === undefined ? {} : { 'Content-Type':'application/json' },
      body:data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error('Связь с сервером прервалась. Попробуйте ещё раз.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) throw new Error(result?.message ?? 'Сервис временно недоступен.');
  return result;
}

export const api = {
  bootstrap:() => request('/bootstrap'),
  saveProfile:data => request('/profile','PATCH',data),
  deleteProfile:() => request('/profile','DELETE'),
  market:(roleId,region,format,mode) => request('/market?' + new URLSearchParams({ roleId,region,format,mode })),
  job:id => request(`/vacancies/${encodeURIComponent(id)}`),
  letter:(id,facts) => request(`/vacancies/${encodeURIComponent(id)}/letter`,'POST',{ facts }),
  criteria:roleId => request(`/criteria/${encodeURIComponent(roleId)}`),
  start:(id,returnTo) => request(`/checks/${encodeURIComponent(id)}/attempts`,'POST',{ returnTo }),
  attempt:id => request(`/attempts/${encodeURIComponent(id)}`),
  answer:(id,index,option) => request(`/attempts/${encodeURIComponent(id)}/answers/${index}`,'PUT',{ option }),
  finish:id => request(`/attempts/${encodeURIComponent(id)}/finish`,'POST',{}),
  materials:() => request('/editor/materials'),
  forkMaterial:(id,version) => request(`/editor/materials/${encodeURIComponent(id)}/${version}/fork`,'POST',{}),
  saveMaterial:(id,version,data) => request(`/editor/materials/${encodeURIComponent(id)}/${version}`,'PATCH',data),
  materialStatus:(id,version,status) => request(`/editor/materials/${encodeURIComponent(id)}/${version}/status`,'POST',{ status }),
  ask:question => request('/ask','POST',{ question },''),
};
